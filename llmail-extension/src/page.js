function listAuthorizedEmails() {
  chrome.storage.sync.get(null, function (items) {
    var allKeys = Object.keys(items);
    var div = document.getElementById("list");
    div.innerHTML = ""; // Clear the div
    allKeys.forEach(function (key) {
      if (key === "apiURL" || key === "apiKey") return;
      var p = document.createElement("p");
      p.textContent = key;
      div.appendChild(p); // This will update the div with new paragraphs
    });
  });
}

window.onload = async function () {
  const apiURL = (await chrome.storage.sync.get("apiURL")).apiURL;
  document.getElementById("apiURL").value = apiURL;

  const apiKey = (await chrome.storage.sync.get("apiKey")).apiKey;
  document.getElementById("apiKey").value = apiKey;

  document.getElementById("apiURL").addEventListener("change", function () {
    chrome.storage.sync.set({ apiURL: this.value });
  });

  document.getElementById("apiKey").addEventListener("change", function () {
    chrome.storage.sync.set({ apiKey: this.value });
  });

  document.querySelector("button").addEventListener("click", function () {
    // Send authorize message to background.js
    chrome.runtime.sendMessage({ action: "authorize" }, function (response) {
      listAuthorizedEmails();
    });
  });
  listAuthorizedEmails();
};
