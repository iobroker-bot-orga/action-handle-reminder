'use strict';

const fs = require('node:fs');

const usedLabels = [];
const token = process.env.INPUT_GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!token) {
    throw new Error('Input "github-token" is required');
}

if (!repository || !repository.includes('/')) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
}

const [owner, repo] = repository.split('/');

function formatDate(ts) {
    const date = new Date(ts);
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

async function githubRequest(method, path, body) {
    const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'action-handle-reminder',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

async function paginate(path) {
    const result = [];
    let page = 1;

    while (true) {
        const data = await githubRequest('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
        result.push(...data);

        if (data.length < 100) {
            break;
        }

        page++;
    }

    return result;
}

function getPullRequestNumber() {
    const issueNumberInput = process.env.INPUT_ISSUE_NUMBER;
    if (issueNumberInput) {
        return `${Number(issueNumberInput) || issueNumberInput}`;
    }

    if (process.env.INPUT_PROCESS_ALL === 'true') {
        return '';
    }

    const eventName = process.env.GITHUB_EVENT_NAME;
    if (eventName === 'schedule' || eventName === 'workflow_dispatch') {
        return '';
    }

    if (process.env.GITHUB_EVENT_PATH) {
        const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        if (event.issue && event.issue.number) {
            return `${event.issue.number}`;
        }
        if (event.pull_request && event.pull_request.number) {
            return `${event.pull_request.number}`;
        }
    }

    return '';
}

async function addLabel(prID, labels) {
    return githubRequest('POST', `/repos/${owner}/${repo}/issues/${prID}/labels`, { labels });
}

async function deleteLabel(prID, label) {
    if (prID) {
        return githubRequest('DELETE', `/repos/${owner}/${repo}/issues/${prID}/labels/${encodeURIComponent(label)}`);
    }

    return githubRequest('DELETE', `/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`);
}

async function getLabels(prID) {
    if (prID) {
        return paginate(`/repos/${owner}/${repo}/issues/${prID}/labels`);
    }

    return paginate(`/repos/${owner}/${repo}/labels`);
}

async function createLabel(name, description, color) {
    return githubRequest('POST', `/repos/${owner}/${repo}/labels`, { name, description, color });
}

async function updateLabel(name, description, color) {
    return githubRequest('PATCH', `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`, { description, color });
}

async function getAllComments(prID) {
    return paginate(`/repos/${owner}/${repo}/issues/${prID}/comments`);
}

async function cleanupLabels() {
    const labels = await getLabels('');
    for (const l of labels) {
        const result = /^(\d?\d)\.(\d?\d)\.(\d\d\d\d)$/g.exec(l.name);
        if (result) {
            const targetTs = new Date(result[3], result[2] - 1, result[1], 0, 0, 0).getTime();
            const nowTs = Date.now();
            if (nowTs > targetTs + 2 * 24 * 60 * 60 * 1000) {
                if (usedLabels.includes(l.name)) {
                    console.log(`    ${l.name} is outdated but still in use`);
                } else {
                    console.log(`    ${l.name} is outdated and will be removed`);
                    await deleteLabel('', l.name);
                }
            }
        }
    }
}

async function cleanupIssueLabels(issues) {
    for (const issue of issues) {
        console.log(`cleanup PR ${issue.number}`);
        for (const l of issue.labels) {
            const result = /^(\d?\d)\.(\d?\d)\.(\d\d\d\d)$/g.exec(l.name);
            if (result) {
                if (usedLabels.includes(`${issue.number}-${l.name}`)) {
                    console.log(`    ${l.name} still valid`);
                } else {
                    console.log(`    ${l.name} will be removed`);
                    await deleteLabel(issue.number, l.name);
                }
            }
        }
    }
}

function addUsedLabels(issueNumber, label) {
    if (!usedLabels.includes(label)) {
        usedLabels.push(label);
    }
    if (!usedLabels.includes(`${issueNumber}-${label}`)) {
        usedLabels.push(`${issueNumber}-${label}`);
    }
}

async function addLabelToIssue(label, issue) {
    let labels = await getLabels('');
    labels = labels.filter(l => l.name === label);

    if (!labels.length) {
        console.log(`    will create label ${label}`);
        await createLabel(label, `remind after ${label}`, 'ffffff');
    }

    addUsedLabels(issue.number, label);
    await addLabel(issue.number, [label]);
}

function findLastMatchingComment(comments, regex) {
    for (let i = comments.length - 1; i >= 0; i--) {
        regex.lastIndex = 0;
        if (regex.exec(comments[i].body || '')) {
            return comments[i];
        }
    }
    return null;
}

async function handleBrandNew(issues) {
    for (const issue of issues) {
        if (issue.labels.find(label => label.name === 'STABLE - brand new')) {
            console.log(`checking PR ${issue.number}`);
            const comments = await getAllComments(issue.number);

            let found = false;

            let comment = findLastMatchingComment(comments, /created (\d+\.\d+\.\d+)/g);
            if (comment) {
                const result = /created (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    let targetTs = new Date(result[3], result[2] - 1, result[1], 0, 0, 0).getTime();
                    targetTs += 14 * 86400 * 1000;
                    const dateStr = formatDate(targetTs);
                    const nowTs = Date.now();
                    const label = `${dateStr}`;

                    await addLabelToIssue(label, issue);

                    if (nowTs < targetTs) {
                        console.log(`    will merged after ${dateStr}`);
                        await updateLabel(label, `remind after ${dateStr}`, 'ffffff');
                    } else {
                        console.log(`    should be merged now (deadline ${dateStr})`);
                        await updateLabel(label, `remind after ${dateStr}`, 'ff0000');
                        await addLabel(issue.number, ['⚠️check']);
                    }
                }
                found = true;
            }

            comment = findLastMatchingComment(comments, /reminder (\d+\.\d+\.\d+)/g);
            if (comment) {
                const result = /reminder (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    const targetTs = new Date(result[3], result[2] - 1, result[1], 0, 0, 0).getTime();
                    const dateStr = formatDate(targetTs);
                    const nowTs = Date.now();
                    const label = `${dateStr}`;

                    await addLabelToIssue(label, issue);

                    if (nowTs < targetTs) {
                        console.log(`    will remind at ${dateStr}`);
                        await updateLabel(label, `remind after ${dateStr}`, 'ffffff');
                    } else {
                        console.log(`    should be checked now (deadline ${dateStr})`);
                        await updateLabel(label, `remind after ${dateStr}`, 'ff0000');
                        await addLabel(issue.number, ['⚠️check']);
                    }
                }
                found = true;
            }

            if (!found) {
                console.log('    no date found');
                await addLabel(issue.number, ['⚠️check']);
            }
        }
    }
}

async function handleOthers(issues) {
    for (const issue of issues) {
        if (!issue.labels.find(label => label.name === 'STABLE - brand new')) {
            console.log(`checking PR ${issue.number}`);
            const comments = await getAllComments(issue.number);

            const comment = findLastMatchingComment(comments, /reminder (\d+\.\d+\.\d+|none)/g);
            if (comment && !comment.body.includes('reminder none')) {
                const result = /reminder (\d+)\.(\d+)\.(\d+)/g.exec(comment.body);
                if (result) {
                    const targetTs = new Date(result[3], result[2] - 1, result[1], 0, 0, 0).getTime();
                    const dateStr = formatDate(targetTs);
                    const nowTs = Date.now();
                    const label = `${dateStr}`;

                    await addLabelToIssue(label, issue);

                    if (nowTs < targetTs) {
                        console.log(`    will remind at ${dateStr}`);
                        await updateLabel(label, `remind after ${dateStr}`, 'ffffff');
                    } else {
                        console.log(`    should be checked now (deadline ${dateStr})`);
                        await updateLabel(label, `remind after ${dateStr}`, 'ff0000');
                    }
                }
            }
        }
    }
}

async function run() {
    let issues = await paginate(`/repos/${owner}/${repo}/issues?state=open`);

    const prID = getPullRequestNumber();
    if (prID) {
        console.log(`processing PR ${prID}`);
        issues = issues.filter(issue => issue.number === Number(prID));
    } else {
        console.log('process all Issues');
    }

    console.log('');
    console.log('process STABLE-brand-new issues');
    await handleBrandNew(issues);

    console.log('');
    console.log('process normal issues');
    await handleOthers(issues);

    console.log('');
    console.log('cleanup labels already set');
    await cleanupIssueLabels(issues);

    console.log('');
    if (prID) {
        console.log('check for outdated labels skipped');
    } else {
        console.log('checking for outdated labels');
        await cleanupLabels();
    }
}

run()
    .then(() => console.log('done'))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
