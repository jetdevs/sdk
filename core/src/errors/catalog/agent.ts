import type { ErrorEntryDef } from '../types';

/**
 * E3000-E3099: what Yobo's tools and agent endpoints tell a Cadra agent.
 * Sources (yobo, origin/develop): connectRefusal codes (agent-connect/requester.ts), the invite and
 * business-record tools, TASK_DELIVERY_ERROR_CODES (agent-tasks/delivery/types.ts), Yobo MCP p99 D11.
 * Generic meanings (not_found, invalid_input, forbidden, rate_limited, conflict, timeout, internal)
 * stay in common.ts; remix, ads, onboarding and connector tool codes live in their own domain files.
 */
export const AGENT = {
  'agent.identity_unavailable': {
    ref: 'E3001', kind: 'needs_merchant', http: 403, trpc: 'FORBIDDEN',
    fallback: "I couldn't confirm who is writing in this chat, so I can't do that here. Please do it in the Yobo app.",
    forward: ['open_app'], resumes: false,
    agent: { reason: "The sender of this chat could not be verified, or the run has no trusted org or identity.", fix: 'Do not retry. Tell the merchant once to do it in the Yobo app. Never guess who they are.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['identity_unavailable', 'not_trusted', 'execution_identity_required', 'authorized_org_required'],
  },
  'agent.feature_disabled': {
    ref: 'E3002', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: "This is switched off for your account right now. You can still do it in the Yobo app.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The feature or the write path is switched off for this org or globally.', fix: 'Do not retry and do not try another tool for it. Reads still work. Tell the merchant to use the Yobo app.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['disabled', 'write_disabled', 'record_flow_disabled'],
  },
  'agent.daily_limit_reached': {
    ref: 'E3003', kind: 'blocked', http: 429, trpc: 'TOO_MANY_REQUESTS',
    fallback: "You've reached today's limit for this. Try again tomorrow or do it in the Yobo app.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The daily cap for this action is used up (invites, launches, ad submits).', fix: 'Do not retry today. Tell the merchant once that the daily limit is reached and the Yobo app can do it.', ask: null, retry: false },
    owner: 'mcp', aliases: ['daily_limit_reached'],
  },
  'agent.spend_limit_reached': {
    ref: 'E3004', kind: 'blocked', http: 429, trpc: 'TOO_MANY_REQUESTS',
    fallback: "You've reached today's limit on creative spend. It resets tomorrow.",
    forward: ['open_app'], resumes: false,
    agent: { reason: "The org's daily creative spend cap is reached.", fix: 'Do not retry today and do not start other paid work. Tell the merchant once that the spend limit is reached.', ask: null, retry: false },
    owner: 'mcp', aliases: ['spend_limit_reached'],
  },
  'agent.seat_limit_reached': {
    ref: 'E3005', kind: 'needs_merchant', http: 402, trpc: 'PAYMENT_REQUIRED',
    fallback: 'There are no free seats left on your plan. Upgrade, or remove someone, then invite again.',
    forward: ['upgrade', 'open_app'], resumes: false,
    agent: { reason: 'The plan has no free seat for another team member.', fix: 'Do not retry. Tell the merchant to upgrade or remove someone in the Yobo app; no invite was sent.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['seat_limit_reached', 'seat_limit'],
  },
  'agent.role_not_grantable': {
    ref: 'E3006', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: "You can't give that role from here. Pick another role, or ask an owner to do it in the Yobo app.",
    forward: ['change', 'open_app'], resumes: false,
    agent: { reason: 'That role cannot be granted from chat or by this user.', fix: 'Do not retry with the same role. Offer the standard role, or tell the merchant to set it in the Yobo app.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['role_not_grantable', 'role_unavailable'],
  },
  'agent.confirm_required': {
    ref: 'E3007', kind: 'retryable', http: 412, trpc: 'PRECONDITION_FAILED',
    fallback: 'Please check the preview and confirm to go on.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'An outward action needs the merchant to see a preview and agree first.', fix: 'Show the preview. Call again with the new confirm code only after the merchant agrees.', ask: null, retry: true },
    owner: 'mcp', aliases: ['confirm_required'],
  },
  'agent.precondition_failed': {
    ref: 'E3008', kind: 'blocked', http: 412, trpc: 'PRECONDITION_FAILED',
    fallback: "That can't be done in its current state. Change it first, then try again.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The record is in a state that does not allow this action (for example a live campaign).', fix: 'Do not retry as is. Read the tool message, make the record editable (pause it), then ask again.', ask: null, retry: false },
    owner: 'mcp', aliases: ['precondition_failed'],
  },
  'agent.account_not_linked': {
    ref: 'E3009', kind: 'needs_merchant', http: 403, trpc: 'FORBIDDEN',
    fallback: "Your sign-in isn't linked to a Yobo account yet. Sign in once in the Yobo app, then reconnect.",
    forward: ['sign_in', 'open_app'], resumes: false,
    agent: { reason: 'The Yobo Connect sign-in maps to no Yobo user.', fix: 'Do not retry. Tell the merchant to sign in once with Sign in with Yobo in the app, then reconnect.', ask: null, retry: false },
    owner: 'mcp', aliases: ['account_not_linked'],
  },
  'agent.insufficient_scope': {
    ref: 'E3010', kind: 'needs_merchant', http: 403, trpc: 'FORBIDDEN',
    fallback: 'This connection can only read. Reconnect and allow changes to do this.',
    forward: ['connect'], resumes: false,
    agent: { reason: 'The token lacks the write scope this tool needs.', fix: 'Do not retry. Tell the merchant to reconnect and allow changes. Reads still work.', ask: null, retry: false },
    owner: 'mcp', aliases: ['insufficient_scope'],
  },
  'agent.already_member': {
    ref: 'E3011', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'That person is already on your team.',
    forward: [], resumes: false,
    agent: { reason: 'The invitee is already a member of this business.', fix: 'Do not retry. Tell the merchant nothing was sent because they are already on the team.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['already_member'],
  },
  'agent.drive_not_connected': {
    ref: 'E3012', kind: 'needs_merchant', http: 409, trpc: 'CONFLICT',
    fallback: 'Google Drive is not connected, or its access has expired. Connect it to go on.',
    forward: ['connect'], resumes: false,
    agent: { reason: "The org's Google Drive is not connected or needs to be authorised again.", fix: 'Do not retry. Send the merchant the connect link from the reply; continue the save after they connect.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['drive_not_connected', 'drive_reauthorization_required'],
  },
  'agent.not_connected': {
    ref: 'E3013', kind: 'blocked', http: 404, trpc: 'NOT_FOUND',
    fallback: "That isn't connected, so there is nothing to disconnect.",
    forward: ['connect'], resumes: false,
    agent: { reason: 'A disconnect was asked for a connector that is not connected.', fix: 'Do not retry. Tell the merchant it was not connected; offer to connect it.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['not_connected'],
  },
  'agent.drive_failed': {
    ref: 'E3014', kind: 'retryable', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "Saving to Google Drive didn't work. Please try again.",
    forward: ['try_again'], resumes: false,
    agent: { reason: 'Google Drive refused or failed the save.', fix: 'Retry once. If it fails again, tell the merchant the save did not work and stop.', ask: null, retry: true },
    owner: 'agent-tools', aliases: ['drive_error'],
  },
  'agent.unsupported_file': {
    ref: 'E3015', kind: 'blocked', http: 415, trpc: 'UNSUPPORTED_MEDIA_TYPE',
    fallback: "That kind of file isn't supported, or it is too big. Choose a different file.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The file type or size is not accepted.', fix: 'Do not retry with the same file. Tell the merchant the limit from the reply and ask for another file.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['unsupported_file'],
  },
  'agent.file_source_rejected': {
    ref: 'E3016', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "I can't use that file because it doesn't come from your chat or your account. Please send it again.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The file reference points outside the merchant’s own files or to a host that is not allowed.', fix: 'Do not retry. Use only a file ref the merchant sent in this chat.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['file_source_rejected', 'foreign_object', 'host_not_allowed', 'not_own_object'],
  },
  'agent.nothing_to_save': {
    ref: 'E3017', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "There was nothing to save from that. Send what you'd like me to keep.",
    forward: ['change'], resumes: false,
    agent: { reason: 'Nothing in the request could be saved or recorded.', fix: 'Do not retry with the same input. Ask the merchant for the file or detail to save.', ask: null, retry: false },
    owner: 'agent-tools', aliases: ['nothing_to_save', 'nothing_to_record'],
  },
  'agent.no_destination': {
    ref: 'E3018', kind: 'needs_merchant', http: 409, trpc: 'CONFLICT',
    fallback: "I don't have a way to message you yet. Connect your chat to get your updates.",
    forward: ['connect'], resumes: false,
    agent: { reason: 'The scheduled task has no chat connection or phone number to deliver to.', fix: 'Do not retry. The run stays undelivered until the merchant connects a chat.', ask: null, retry: false },
    owner: 'agent-tasks', aliases: ['no-destination', 'skipped_no_destination'],
  },
  'agent.send_unconfirmed': {
    ref: 'E3019', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "I can't tell if that message arrived. Please check your chat before I send it again.",
    forward: [], resumes: false,
    agent: { reason: 'The send may already have reached the merchant; its outcome is unknown and the send is held.', fix: 'Do not resend. The merchant can open the earlier message; a tap on it recovers the content.', ask: null, retry: false },
    owner: 'agent-tasks', aliases: ['send_in_flight', 'send-unconfirmed'],
  },
  'agent.no_recent_reminder': {
    ref: 'E3020', kind: 'blocked', http: 404, trpc: 'NOT_FOUND',
    fallback: "There's no recent reminder to answer. Open the app to see your latest.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'A reply or tap arrived but no recent reminder or brief was sent to answer.', fix: 'Do not retry. Tell the merchant there is nothing recent to answer and point to the app.', ask: null, retry: false },
    owner: 'agent-tasks', aliases: ['no_recent_reminder'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
