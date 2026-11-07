(() => {
	const PAGE = "partner.steamgames.com";
	if (typeof location === "undefined" || location.hostname !== PAGE || !location.pathname.startsWith("/querycdkey")) {
		console.error("This script only runs on " + PAGE + "/querycdkey. No request was sent.");
		return;
	}
	if (document.getElementById("steam-key-status")) {
		console.warn("The query box is already open.");
		return;
	}

	const KEY_PATTERN = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;
	const DELAY_MS = 2000;
	const DELAY_429_MS = 15000;

	const box = document.createElement("div");
	box.id = "steam-key-status";
	box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;width:380px;max-width:calc(100vw - 32px);background:#1b2838;color:#c6d4df;padding:12px;border:1px solid #67c1f5;font:13px/1.4 Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)";

	const title = document.createElement("div");
	title.textContent = "Key status";
	title.style.cssText = "font-weight:bold;margin-bottom:8px";

	const field = document.createElement("textarea");
	field.rows = 10;
	field.placeholder = "One key per line.\nOptional note: KEY,channel";
	field.style.cssText = "width:100%;box-sizing:border-box;margin-bottom:8px;background:#0e141b;color:#c6d4df;border:1px solid #2a475e;padding:6px;resize:vertical";

	const button = document.createElement("button");
	button.type = "button";
	button.textContent = "Query";
	button.style.cssText = "background:#67c1f5;color:#0e141b;border:0;padding:6px 12px;font-weight:bold;cursor:pointer";

	const statusLine = document.createElement("div");
	statusLine.style.cssText = "margin-top:8px;min-height:1.4em";

	box.append(title, field, button, statusLine);
	document.body.appendChild(box);

	let running = false;

	function wait(ms) {
		return new Promise((done) => setTimeout(done, ms));
	}

	function escapeHtml(value) {
		return String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function isUnused(status) {
		return String(status || "").toLowerCase().startsWith("not activated");
	}

	function markerColor(status) {
		const text = String(status || "").toLowerCase();
		if (text === "activated") return "#d64545";
		if (isUnused(status)) return "#3fa85a";
		return "#8b9bb4";
	}

	function unusedKeys(rows) {
		const seen = new Set();
		const list = [];
		for (const row of rows) {
			if (!isUnused(row.status)) continue;
			const key = String(row.key || "").trim();
			if (!key || seen.has(key)) continue;
			seen.add(key);
			list.push(key);
		}
		return list;
	}

	function downloadText(text, fileName) {
		const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
		const link = document.createElement("a");
		const url = URL.createObjectURL(blob);
		link.href = url;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1500);
	}

	function squash(text) {
		return String(text || "").replace(/\s+/g, " ").trim();
	}

	function readInput(text) {
		const rows = [];
		for (const rawLine of String(text || "").split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith("#")) continue;
			const comma = line.indexOf(",");
			const rawKey = (comma === -1 ? line : line.slice(0, comma)).trim();
			const note = comma === -1 ? "" : line.slice(comma + 1).trim();
			const key = rawKey.toUpperCase();
			if (!KEY_PATTERN.test(key)) {
				rows.push({ key: rawKey, status: "invalid_format", time: "", packageName: "", label: "", note });
				continue;
			}
			rows.push({ key, status: "", time: "", packageName: "", label: "", note, query: true });
		}
		return rows;
	}

	function ownText(el) {
		let text = "";
		for (const node of el.childNodes) {
			if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
		}
		return squash(text);
	}

	function nextTable(el) {
		let node = el;
		for (let up = 0; up < 8 && node; up++) {
			let sibling = node.nextElementSibling;
			while (sibling) {
				if (sibling.tagName === "TABLE") return sibling;
				if (sibling.querySelector) {
					const inner = sibling.querySelector("table");
					if (inner) return inner;
				}
				sibling = sibling.nextElementSibling;
			}
			node = node.parentElement;
		}
		return null;
	}

	function cellsOf(row) {
		return [...row.querySelectorAll("th,td")].map((cell) => squash(cell.textContent));
	}

	function looksLikeData(cells) {
		const first = (cells[0] || "").toLowerCase();
		return first === "activated" || first.includes("not activ") || first.includes("invalid");
	}

	function readTable(table) {
		const rows = [...table.querySelectorAll("tr")].filter((row) => row.querySelector("th,td"));
		if (!rows.length) return null;
		const first = cellsOf(rows[0]);
		let headers = null;
		let data = null;
		if (looksLikeData(first) || rows.length === 1) {
			data = first;
		} else if (rows.length >= 2) {
			headers = first.map((header) => header.toLowerCase());
			data = cellsOf(rows[1]);
		}
		if (!data) return null;
		const pick = (words, fallback) => {
			if (headers) {
				const index = headers.findIndex((header) => words.some((word) => header.includes(word)));
				if (index >= 0) return data[index] || "";
			}
			return data[fallback] || "";
		};
		return {
			status: pick(["status", "durum", "state"], 0),
			time: pick(["time", "date", "zaman", "tarih"], 1),
			packageName: pick(["package", "paket"], 2),
			label: pick(["label", "tag", "etiket", "request"], 3),
		};
	}

	function activationTable(doc) {
		if (!doc.body) return null;
		const candidates = [...doc.body.querySelectorAll("*")];
		for (const el of candidates) {
			if (!/activation details/i.test(ownText(el))) continue;
			const table = el.closest("table") || nextTable(el);
			if (table) return readTable(table);
		}
		return null;
	}

	function officialMessage(doc) {
		const selectors = [".error", ".errors", ".formRow_error", "#error_display", ".partner_error"];
		for (const selector of selectors) {
			const el = doc.querySelector(selector);
			const text = el ? squash(el.textContent) : "";
			if (text) return text.slice(0, 300);
		}
		const body = doc.body ? doc.body.innerText : "";
		const match = body.match(/The product (?:code|key)[^\n]{0,180}/i);
		return match ? squash(match[0]).slice(0, 300) : "";
	}

	function sessionExpired(response, html) {
		const url = String(response.url || "");
		if (/\/login/i.test(url) || /openid/i.test(url)) return true;
		const doc = new DOMParser().parseFromString(html, "text/html");
		const titleText = (doc.title || "").toLowerCase();
		if (titleText.includes("sign in") || titleText.includes("log in")) return true;
		if (doc.querySelector('input[type="password"]')) return true;
		return false;
	}

	function parseResult(html) {
		const doc = new DOMParser().parseFromString(html, "text/html");
		const table = activationTable(doc);
		if (table && table.status) return table;
		const official = officialMessage(doc);
		if (official) return { status: official, time: "", packageName: "", label: "" };
		return null;
	}

	async function queryOne(key) {
		let attempts429 = 0;
		for (;;) {
			let response;
			try {
				response = await fetch("/querycdkey/cdkey?cdkey=" + encodeURIComponent(key) + "&method=Query", { credentials: "same-origin" });
			} catch (error) {
				return { kind: "network" };
			}
			if (response.status === 429) {
				attempts429 += 1;
				if (attempts429 >= 2) return { kind: "stop429" };
				statusLine.textContent = "Steam returned 429. Waiting 15 seconds.";
				await wait(DELAY_429_MS);
				continue;
			}
			if (!response.ok) return { kind: "network" };
			const html = await response.text();
			if (sessionExpired(response, html)) return { kind: "session" };
			return { kind: "ok", html };
		}
	}

	function skipRest(rows, start) {
		for (let i = start; i < rows.length; i++) {
			if (rows[i].query && !rows[i].status) rows[i].status = "skipped";
		}
	}

	function cellStyle() {
		return "border:1px solid #2a475e;padding:8px 10px;text-align:left;vertical-align:top";
	}

	function showTable(rows) {
		const previous = document.getElementById("steam-key-table");
		if (previous) previous.remove();
		const panel = document.createElement("div");
		panel.id = "steam-key-table";
		panel.style.cssText = "position:fixed;left:16px;top:16px;right:420px;bottom:16px;z-index:2147483646;overflow:auto;background:#1b2838;color:#c6d4df;padding:12px;border:1px solid #67c1f5;font:13px/1.4 Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)";
		const header = document.createElement("div");
		header.style.cssText = "display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px";
		const legend = document.createElement("div");
		legend.textContent = "Red: activated. Green: not activated. Gray: other.";
		const unusedButton = document.createElement("button");
		unusedButton.type = "button";
		unusedButton.textContent = "Download unused keys";
		unusedButton.style.cssText = "background:#3fa85a;color:#0e141b;border:0;padding:6px 12px;font-weight:bold;cursor:pointer";
		const unusedNote = document.createElement("span");
		unusedButton.addEventListener("click", () => {
			const list = unusedKeys(rows);
			if (!list.length) {
				unusedNote.textContent = "No unused keys.";
				return;
			}
			unusedNote.textContent = "";
			downloadText(list.join("\r\n") + "\r\n", "unused-keys.txt");
		});
		header.append(legend, unusedButton, unusedNote);
		const table = document.createElement("table");
		table.style.cssText = "border-collapse:collapse;width:100%";
		const thead = document.createElement("thead");
		const headRow = document.createElement("tr");
		for (const name of ["", "key", "status", "time", "package", "label", "note"]) {
			const th = document.createElement("th");
			th.textContent = name;
			th.style.cssText = cellStyle() + ";background:#0e141b";
			headRow.appendChild(th);
		}
		thead.appendChild(headRow);
		const tbody = document.createElement("tbody");
		for (const row of rows) {
			const tr = document.createElement("tr");
			const colorCell = document.createElement("td");
			colorCell.style.cssText = cellStyle();
			const square = document.createElement("span");
			square.style.cssText = "display:inline-block;width:14px;height:14px;border-radius:2px;background:" + markerColor(row.status);
			colorCell.appendChild(square);
			tr.appendChild(colorCell);
			for (const value of [row.key, row.status, row.time, row.packageName, row.label, row.note]) {
				const td = document.createElement("td");
				td.textContent = value;
				td.style.cssText = cellStyle();
				tr.appendChild(td);
			}
			tbody.appendChild(tr);
		}
		table.append(thead, tbody);
		panel.append(header, table);
		document.body.appendChild(panel);
	}

	function downloadScript() {
		return [
			"(function () {",
			"  var button = document.getElementById('unused-download');",
			"  button.addEventListener('click', function () {",
			"    var seen = {};",
			"    var list = [];",
			"    var rows = document.querySelectorAll('tbody tr');",
			"    for (var i = 0; i < rows.length; i++) {",
			"      var cells = rows[i].querySelectorAll('td');",
			"      if (cells.length < 3) continue;",
			"      var status = (cells[2].textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();",
			"      if (status.indexOf('not activated') !== 0) continue;",
			"      var key = (cells[1].textContent || '').replace(/\\s+/g, ' ').trim();",
			"      if (!key || seen[key]) continue;",
			"      seen[key] = true;",
			"      list.push(key);",
			"    }",
			"    var note = document.getElementById('unused-note');",
			"    if (!list.length) {",
			"      note.textContent = 'No unused keys.';",
			"      return;",
			"    }",
			"    note.textContent = '';",
			"    var blob = new Blob([list.join('\\r\\n') + '\\r\\n'], { type: 'text/plain;charset=utf-8' });",
			"    var url = URL.createObjectURL(blob);",
			"    var link = document.createElement('a');",
			"    link.href = url;",
			"    link.download = 'unused-keys.txt';",
			"    document.body.appendChild(link);",
			"    link.click();",
			"    link.remove();",
			"    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);",
			"  });",
			"})();",
		].join("\n");
	}

	function htmlReport(rows) {
		const headers = ["", "key", "status", "time", "package", "label", "note"];
		const body = rows.map((row) => {
			const cells = [row.key, row.status, row.time, row.packageName, row.label, row.note]
				.map((cell) => "<td>" + escapeHtml(cell) + "</td>")
				.join("");
			return "<tr><td><span class=\"swatch\" style=\"background:" + markerColor(row.status) + "\"></span></td>" + cells + "</tr>";
		}).join("");
		const style = "body{font:14px/1.4 Arial,sans-serif;background:#1b2838;color:#c6d4df;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #2a475e;padding:8px 10px;text-align:left;vertical-align:top}th{background:#0e141b}.swatch{display:inline-block;width:14px;height:14px;border-radius:2px}button{background:#3fa85a;color:#0e141b;border:0;padding:6px 12px;font-weight:bold;cursor:pointer;margin-left:12px}#unused-note{margin-left:12px}";
		return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Key status</title><style>" + style + "</style></head><body><p>Red: activated. Green: not activated. Gray: other. <button type=\"button\" id=\"unused-download\">Download unused keys</button><span id=\"unused-note\"></span></p><table><thead><tr>"
			+ headers.map((name) => "<th>" + escapeHtml(name) + "</th>").join("")
			+ "</tr></thead><tbody>" + body + "</tbody></table><script>" + downloadScript() + "</script></body></html>";
	}

	function downloadReport(rows) {
		showTable(rows);
		const blob = new Blob([htmlReport(rows)], { type: "text/html;charset=utf-8" });
		const link = document.createElement("a");
		const url = URL.createObjectURL(blob);
		link.href = url;
		link.download = "steam-key-status.html";
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1500);
	}

	function summary(rows) {
		const activated = rows.filter((row) => row.status.toLowerCase() === "activated").length;
		const errors = rows.filter((row) => row.status === "error").length;
		const notActivated = rows.filter((row) => {
			if (!row.status) return false;
			if (row.status.toLowerCase() === "activated") return false;
			return !["invalid_format", "error", "skipped", "session_expired"].includes(row.status);
		}).length;
		const skipped = rows.filter((row) => row.status === "skipped" || row.status === "session_expired").length;
		let text = "Done. Activated: " + activated + ", not activated: " + notActivated + ", errors: " + errors + ".";
		if (skipped) text += " Skipped: " + skipped + ".";
		console.log(text);
		return text;
	}

	async function run() {
		if (running) return;
		const rows = readInput(field.value);
		if (!rows.length) {
			statusLine.textContent = "The box is empty.";
			return;
		}
		running = true;
		button.disabled = true;
		let networkFailures = 0;
		let sentRequest = false;
		try {
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];
				if (!row.query) continue;
				if (sentRequest) await wait(DELAY_MS);
				sentRequest = true;
				statusLine.textContent = "Query " + (i + 1) + "/" + rows.length;
				const result = await queryOne(row.key);
				if (result.kind === "ok") {
					networkFailures = 0;
					const parsed = parseResult(result.html);
					if (!parsed) {
						row.status = "error";
					} else {
						row.status = parsed.status;
						row.time = parsed.time;
						row.packageName = parsed.packageName;
						row.label = parsed.label;
					}
					console.log(row.key + "\t" + row.status);
					continue;
				}
				if (result.kind === "session") {
					row.status = "session_expired";
					skipRest(rows, i + 1);
					console.error("Session expired. Remaining keys were skipped.");
					break;
				}
				if (result.kind === "stop429") {
					row.status = "skipped";
					skipRest(rows, i + 1);
					console.error("Steam returned 429. Query stopped.");
					break;
				}
				row.status = "error";
				networkFailures += 1;
				console.error(row.key + "\tnetwork error");
				if (networkFailures >= 3) {
					skipRest(rows, i + 1);
					console.error("Three network errors. Query stopped.");
					break;
				}
			}
			downloadReport(rows);
			statusLine.textContent = summary(rows);
		} finally {
			running = false;
			button.disabled = false;
		}
	}

	button.addEventListener("click", () => {
		run();
	});
	console.log("Query box is ready. Paste your keys and press Query.");
})();
