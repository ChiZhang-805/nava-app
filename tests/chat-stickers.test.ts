import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {CHAT_STICKERS, encodeChatSticker, parseChatSticker} from "../src/services/chatStickers.ts";
import {CHAT_STICKER_DEFINITIONS, describeChatSticker} from "../supabase/functions/_shared/chat-stickers.ts";

test("all shipped stickers roundtrip through known markers and match pinned asset digests", () => {
  const manifest=JSON.parse(readFileSync("public/stickers/fluent-flat/sources.json","utf8"));
  assert.equal(CHAT_STICKERS.length,30);
  for(const sticker of CHAT_STICKERS) {
    assert.equal(parseChatSticker(encodeChatSticker(sticker.id))?.id,sticker.id);
    const asset=manifest.assets.find((item: {id:string})=>item.id===sticker.id);
    assert.ok(asset);
    const svg=readFileSync(`public/stickers/fluent-flat/${asset.file}`);
    assert.equal(createHash("sha256").update(svg).digest("hex"),asset.sha256);
    assert.doesNotMatch(svg.toString(), /<script|<foreignObject|\bon\w+\s*=/i);
  }
  assert.match(readFileSync("public/stickers/fluent-flat/LICENSE.txt","utf8"),/MIT License[\s\S]*Microsoft Corporation/);
});

test("sticker decoder does not turn arbitrary text, URLs, unknown ids or markup into media", () => {
  for(const content of ["[nava-sticker:unknown]", "hello [nava-sticker:hug]", "[nava-sticker:https://example.com/x.svg]", "<img src=x>", "[nava-sticker:hug]\nmore"]) {
    assert.equal(parseChatSticker(content),null);
    assert.equal(describeChatSticker(content),null);
  }
});

test("frontend and model receive the same allowlisted sticker meanings, without raw markers", () => {
  assert.equal(new Set(CHAT_STICKER_DEFINITIONS.map(sticker=>sticker.id)).size,30);
  const counts:Record<string,number>={};
  for(const sticker of CHAT_STICKERS) {
    const marker=encodeChatSticker(sticker.id);
    assert.equal(describeChatSticker(marker),`用户发了一个表达「${sticker.label}」的表情。`);
    assert.equal(describeChatSticker(marker,"en"),`The user sent a sticker expressing “${sticker.labelEn}”.`);
    counts[sticker.category]=(counts[sticker.category]??0)+1;
  }
  assert.deepEqual(counts,{reply:5,mood:10,company:7,daily:8});
});
