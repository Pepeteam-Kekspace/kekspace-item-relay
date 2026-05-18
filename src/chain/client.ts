import {createPublicClient, http} from "viem";
import type {PublicClient} from "viem";
import type {ServiceConfig} from "../types.js";

export function createChainClient(config: ServiceConfig["chain"]): PublicClient {
  return createPublicClient({
    transport: http(config.httpRpcUrl),
  });
}
