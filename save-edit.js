function getDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Indexed DB does not exist"));
      return;
    }

    const indexedDbRequest = window.indexedDB.open("bitburnerSave", 2);

    indexedDbRequest.onupgradeneeded = function () {
      const db = indexedDbRequest.result;
      if (!db.objectStoreNames.contains("savestring")) {
        db.createObjectStore("savestring");
      }
    };

    indexedDbRequest.onerror = function () {
      reject(indexedDbRequest.error ?? new Error("Failed to get IDB"));
    };

    indexedDbRequest.onblocked = function () {
      reject(new Error("Database in use by another tab. Close other Bitburner tabs."));
    };

    indexedDbRequest.onsuccess = function () {
      const db = indexedDbRequest.result;
      if (!db) {
        reject(new Error("database loading result was undefined"));
        return;
      }
      resolve(db);
    };
  });
}

async function load() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["savestring"], "readonly");
    transaction.onerror = () => reject(transaction.error ?? new Error("Error loading game from IndexedDB"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Load transaction aborted"));

    const request = transaction.objectStore("savestring").get("save");
    request.onsuccess = () => resolve(request.result);
  });
}

async function save(saveData) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["savestring"], "readwrite");
    transaction.onerror = () => reject(transaction.error ?? new Error("Error saving game to IndexedDB"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Save transaction aborted"));

    transaction.objectStore("savestring").put(saveData, "save");
    transaction.oncomplete = () => resolve();
  });
}

async function decodeSaveData(saveData) {
  if (saveData instanceof Uint8Array) {
    const stream = new Blob([saveData]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }

  return decodeURIComponent(escape(atob(saveData)));
}

async function encodeSaveData(jsonSaveString, preferBinary) {
  if (preferBinary) {
    const stream = new Blob([jsonSaveString]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  return btoa(unescape(encodeURIComponent(jsonSaveString)));
}

/** @param {NS} ns **/
export async function main(ns) {
  const saveData = await load();
  if (!saveData) {
    ns.tprint("No save data found in IndexedDB.");
    return;
  }

  const preferBinary = saveData instanceof Uint8Array;
  const saveStr = await decodeSaveData(saveData);
  const saveObj = JSON.parse(saveStr);
  const saveDataObj = saveObj?.data ?? saveObj;
  if (typeof saveDataObj.PlayerSave !== "string") {
    ns.tprint(`Could not find PlayerSave. Top-level keys: ${Object.keys(saveObj).join(", ")}`);
    if (saveObj?.data) ns.tprint(`data keys: ${Object.keys(saveObj.data).join(", ")}`);
    return;
  }

  const playerObj = JSON.parse(saveDataObj.PlayerSave);
  const player = playerObj?.data ?? playerObj;

  player.exploits = Array.isArray(player.exploits) ? player.exploits : [];
  if (!player.exploits.includes("EditSaveFile")) {
    player.exploits.push("EditSaveFile");
  }

  saveDataObj.PlayerSave = JSON.stringify(playerObj);
  await save(await encodeSaveData(JSON.stringify(saveObj), preferBinary));
  ns.tprint("Added EditSaveFile exploit to saved game. Reload Bitburner to load the edited save.");
}
