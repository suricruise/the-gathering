import{execFileSync}from'node:child_process';import{readFileSync}from'node:fs';
const rules=[/sb_secret_[A-Za-z0-9_-]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/AKIA[0-9A-Z]{16}/];
let failures=0;const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){let s;try{s=readFileSync(file,'utf8')}catch{continue}if(rules.some(r=>r.test(s))){console.error('Credential-shaped value in tracked file:',file);failures++;}}
// Check historical patches too, reporting commit IDs only, never matched values.
for(const commit of execFileSync('git',['rev-list','--all'],{encoding:'utf8'}).trim().split('\n').filter(Boolean)){const patch=execFileSync('git',['show','--format=','--no-ext-diff',commit],{encoding:'utf8',maxBuffer:32*1024*1024});if(rules.some(r=>r.test(patch))){console.error('Credential-shaped value in history:',commit.slice(0,12));failures++;}}
if(failures)process.exitCode=1;else console.log('PASS tracked files and Git history contain no recognized private credential patterns. This is not a proof against all secret formats.');
