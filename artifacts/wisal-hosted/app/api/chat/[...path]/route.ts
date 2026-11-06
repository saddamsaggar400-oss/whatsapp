import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { cloudEnvironment } from "../../../../lib/chat/cloud";
import { handleChatRequest } from "../../../../lib/chat/service";

export const dynamic = "force-dynamic";
async function route(request: Request) {
  const identity = await getChatGPTUser();
  return handleChatRequest(request, cloudEnvironment(env, identity));
}
export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
