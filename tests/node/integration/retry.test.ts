import { createServer, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { EsploraClient } from "../../../pkg/bitcoindevkit";

describe("Esplora retry timers in Node.js", () => {
  let server: Server;
  let url: string;
  let requests: number;
  let failCount: number;

  beforeEach(async () => {
    requests = 0;
    server = createServer((_request, response) => {
      requests++;
      response.writeHead(requests <= failCount ? 503 : 200, {
        "Content-Type": "application/json",
      });
      response.end(requests <= failCount ? "{}" : '{"1":2}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });

  it("retries a transient HTTP failure without requiring window", async () => {
    failCount = 1;
    const estimates = await new EsploraClient(url, 1).get_fee_estimates();
    expect(estimates.get(1)).toBe(2);
    expect(requests).toBe(2);
  }, 10000);

  it("rejects when the configured retry budget is exhausted", async () => {
    failCount = 10;
    await expect(new EsploraClient(url, 1).get_fee_estimates()).rejects.toThrow();
    expect(requests).toBe(2);
  }, 10000);
});
