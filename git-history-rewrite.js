const { execSync } = require("child_process");
const fs = require("fs").promises;
const path = require("path");

const RECORD_FILE = "commit_record.json";

function exec(command) {
  try {
    return execSync(command, { encoding: "utf8" }).trim();
  } catch (error) {
    console.error(`执行命令失败: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

function getCurrentBranch() {
  return exec("git rev-parse --abbrev-ref HEAD");
}

function formatDate(date) {
  return date.toISOString().replace("T", " ").substr(0, 19);
}

function getCommitHistory(branch) {
  console.log(`获取分支 ${branch} 的提交历史...`);
  const commits = exec(
    `git log ${branch} --first-parent --pretty=format:"%H|%s|%ct" --reverse`
  );
  console.log(`获取到 ${commits.split("\n").length} 条提交记录`);
  return commits.split("\n").map((commit) => {
    const [hash, message, timestamp] = commit.split("|");
    return {
      hash,
      message,
      date: formatDate(new Date(timestamp * 1000)),
    };
  });
}

async function writeRecordFile(commits, branch) {
  const content = JSON.stringify({ branch, commits }, null, 2);
  await fs.writeFile(RECORD_FILE, content);
  console.log(`提交记录已写入 ${RECORD_FILE}`);
}

async function readRecordFile() {
  const content = await fs.readFile(RECORD_FILE, "utf8");
  return JSON.parse(content);
}

async function generateRecord() {
  const currentBranch = getCurrentBranch();
  console.log(`当前分支: ${currentBranch}`);

  let commits = getCommitHistory(currentBranch);

  // 按 date 去重
  commits = Array.from(new Map(commits.map((c) => [c.date, c])).values());

  console.log(`去重后剩余 ${commits.length} 条提交记录`);

  await writeRecordFile(commits, currentBranch);
}

async function applyRecord() {
  const { branch, commits } = await readRecordFile();
  console.log(`正在应用 ${branch} 分支的 ${commits.length} 条提交记录`);

  // 创建临时分支
  const tempBranch = `temp-${Date.now()}`;
  exec(`git checkout --orphan ${tempBranch}`);
  exec("git rm -rf .");

  for (const commit of commits) {
    // 恢复到该提交时的文件状态
    exec(`git checkout ${commit.hash} .`);
    exec("git add .");
    exec(`git commit --date="${commit.date}" -m "${commit.message}"`);
  }

  // 替换原分支
  exec(`git branch -D ${branch}`);
  exec(`git branch -m ${branch}`);
  console.log(`已重写 ${branch} 分支的提交历史`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "generate") {
    await generateRecord();
  } else if (command === "apply") {
    await applyRecord();
  } else {
    console.log("用法: node script.js [generate|apply]");
    console.log("generate: 生成提交记录文件");
    console.log("apply: 应用修改后的提交记录");
  }
}

main().catch((error) => {
  console.error("发生错误:", error);
  process.exit(1);
});
