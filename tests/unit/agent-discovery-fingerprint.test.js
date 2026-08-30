const fs = require('fs');
const os = require('os');
const path = require('path');

const { fingerprintJsonDir } = require('../../src/main/services/agent-discovery-fingerprint');

describe('agent-discovery-fingerprint', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fingerprint-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('changes when a .jsonl transcript is appended to', async () => {
    // Arrange: a project dir holding only .jsonl transcripts
    const file = path.join(dir, 'abc123.jsonl');
    fs.writeFileSync(file, '{"type":"user","message":{"role":"user","content":"hi"}}\n');
    const before = await fingerprintJsonDir(dir);

    // Act: simulate Claude Code appending a turn
    fs.appendFileSync(file, '{"type":"assistant","message":{"role":"assistant","content":[]}}\n');
    const after = await fingerprintJsonDir(dir);

    // Assert
    expect(after).not.toBe(before);
  });

  test('tracks .jsonl files individually rather than falling back to dir stat', async () => {
    // A dir-stat fallback would also change when a file is added, so assert on
    // the token shape: one stat token per transcript, which only holds if the
    // .jsonl files are actually being enumerated.
    fs.writeFileSync(path.join(dir, 'one.jsonl'), '{}\n');
    fs.writeFileSync(path.join(dir, 'two.jsonl'), '{}\n');

    const fingerprint = await fingerprintJsonDir(dir);

    expect(fingerprint.split(',')).toHaveLength(2);
  });

  test('still tracks legacy .json session files', async () => {
    const file = path.join(dir, 'legacy.json');
    fs.writeFileSync(file, '{"title":"a"}');
    const before = await fingerprintJsonDir(dir);

    fs.writeFileSync(file, '{"title":"ab"}');
    const after = await fingerprintJsonDir(dir);

    expect(after).not.toBe(before);
  });
});
