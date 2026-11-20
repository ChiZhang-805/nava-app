import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {CHAT_STICKERS, encodeChatSticker, parseChatSticker} from "../src/services/chatStickers.ts";

test("all shipped stickers roundtrip through known markers and match pinned asset digests", () => {
  const manifest=JSON.parse(readFileSync("public/stickers/fluent-flat/sources.json","utf8"));
  assert.equal(CHAT_STICKERS.length,12);
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
  for(const content of ["[nava-sticker:unknown]", "hello [nava-sticker:hug]", "[nava-sticker:https://example.com/x.svg]", "<img src=x>", "[nava-sticker:hug]\nmore"]) assert.equal(parseChatSticker(content),null);
});
