# Steamworks key status

Check whether Steam product keys you generated have been activated. The script runs in your own browser, on the Steamworks page you are already logged into. It does not send keys anywhere else.

This is not a Valve product and it is not affiliated with Steam.

## Who it is for

Steamworks partners who have the **Generate Steam Keys** permission. Steam only returns a result for a key from a batch you requested. Someone else's key comes back as invalid. The script cannot reveal a key you do not already have permission to query.

## Security

The whole program is [`query.js`](query.js). Read it before you paste it.

It makes one kind of request, and only from the open Query Steam Key tab:

```js
fetch("/querycdkey/cdkey?cdkey=" + encodeURIComponent(key) + "&method=Query", { credentials: "same-origin" })
```

That address is relative. The browser sends it to `partner.steamgames.com` because that is the page you are on. The script does not read or write `document.cookie`. It does not call any other host, analytics endpoint, or webhook. Keys stay in that tab until you download the report yourself.

There is no website here to paste keys into. If a page asks you to upload keys to check them, it is not this tool.

Requests run one at a time, with two seconds between them. A rate-limit response waits 15 seconds and retries once. A second rate limit stops the run. Three network errors in a row also stop it. The report still downloads with whatever finished.

## Requirements

A Steamworks account that can open:

https://partner.steamgames.com/querycdkey/

Official single-key lookup, which this script repeats slowly, is documented by Steam under Steam Keys, section "Querying Keys".

## How to use

1. Open the Query Steam Key page and sign in.
2. Open the developer console with F12. The first time, Chrome asks you to type `allow pasting` and press Enter. Type those two words yourself, without quotes.
3. Open `query.js`, select the entire file, paste it into the console, and press Enter.
4. A **Key status** box appears at the bottom right. Paste one key per line.
5. Press **Query**.

An optional note after a comma is copied into the report. The note is not sent to Steam.

```
KEY,channel
```

Lines that start with `#` are skipped. A line that is not a Steam key shape is marked `invalid_format` and is not requested.

## Results

A wide table opens on the page, and `steam-key-status.html` downloads. Each key is its own row: marker, key, status, time, package, label, note.

The marker at the start of the row:

- Red: Steam says `Activated`. The key has been used.
- Green: Steam's status starts with `Not Activated`. The key has not been used.
- Gray: anything else, including `invalid_format`, `error`, `skipped`, and `session_expired`.

Steam's own wording is kept as-is. Gray does not mean the key is unused. An error, a skipped row, or an unrecognized reply is not treated as a spare key.

**Download unused keys** writes `unused-keys.txt`. The file has one unused key per line, with no notes, and a repeated key is written once. Activated and gray rows are left out. If there is no green row, no file is downloaded.

Our own markers:

| Marker | Meaning |
| --- | --- |
| `invalid_format` | The line was not a key. No request was sent. |
| `error` | The page did not contain the expected table, or the request failed. |
| `session_expired` | Steamworks asked you to sign in again. |
| `skipped` | The run stopped before this key was queried. |

## Pace

One hundred keys take a little over three minutes. Split a long list into batches. For totals only, the Key Stats section on your app's Request Steam Product Keys page already shows activated and unactivated counts. This script is not an official bulk API. It is a slow repeat of the query page Steam already gives you.

## License

[MIT](LICENSE)
