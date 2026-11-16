import { it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

it("survives compressed JSON requests with trailing bytes", { timeout: 20000 }, async () => {
  // A vulnerable parser can crash Node after responding. Isolate that failure
  // from the test runner and verify that the server still accepts requests.
  const appUrl = new URL("../src/index.js", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    import http from "node:http";
    import { once } from "node:events";
    import { gzipSync, deflateSync } from "node:zlib";
    import { setTimeout } from "node:timers/promises";
    process.env.NODE_ENV = "test";
    const { default: app } = await import(${JSON.stringify(appUrl)});
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const send = (method, payload, encoding) => new Promise((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1", port: server.address().port, path: "/", method,
        headers: payload ? {
          "content-type": "application/json", "content-encoding": encoding,
          "content-length": payload.length,
        } : {},
      }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end(payload);
    });
    try {
      for (const [encoding, compress] of [["gzip", gzipSync], ["deflate", deflateSync]]) {
        const compressed = compress(Buffer.from("{}"));
        assert.equal(await send("POST", compressed, encoding), 404);
        const malformed = Buffer.concat([compressed, Buffer.alloc(65536, 255)]);
        assert.ok([400, 404].includes(await send("POST", malformed, encoding)));
        await setTimeout(100);
        assert.equal(await send("GET"), 200);
      }
      console.log("compressed-request regression passed");
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  `;
  const { stdout } = await run(process.execPath, ["--input-type=module", "-e", script], { timeout: 15000 });
  assert.match(stdout, /compressed-request regression passed/);
});
