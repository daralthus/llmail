import env from "../.env.json";

async function authorize(email) {
  // oauth as a 'web app' to google to be able to use the gmail api
  // instead of a 'chrome extension'
  const scopes = encodeURIComponent(
    [
      "profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.labels",
    ].join(" ")
  );
  const redirectUrl = encodeURIComponent(
    `https://${chrome.runtime.id}.chromiumapp.org`
  );
  // client id must be web app
  // redirect url must be set on consent screen
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${
    env.GOOGLE_CLIENT_ID
  }&response_type=token&redirect_uri=${redirectUrl}&scope=${scopes}${
    email ? `&login_hint=${email}` : ""
  }`;

  try {
    const redirect_url = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    const params = new URLSearchParams(redirect_url.split("#")[1]);
    const token = params.get("access_token");
    const expiresIn = params.get("expires_in");
    const expirationTime = new Date().getTime() + expiresIn * 1000;

    // Get user details for logged in token
    const userData = await fetch(
      "https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=" +
        token,
      {
        method: "GET",
      }
    ).then((response) => response.json());

    if (email !== undefined && userData.email !== email) {
      throw new Error("Authorized wrong account");
    }

    // cache token
    await chrome.storage.sync.set({
      [userData.email]: {
        token: token,
        tokenExpiration: expirationTime,
      },
    });

    return token;
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function getToken(email) {
  const { token, tokenExpiration } =
    (await chrome.storage.sync.get(email)) || {};
  if (token && new Date().getTime() < tokenExpiration) {
    return token;
  } else {
    // clear cache
    await chrome.storage.sync.remove(email);
    return await authorize(email);
  }
}

async function fetchLabels(email) {
  const token = await getToken(email);
  const response = await fetch(
    `https://www.googleapis.com/gmail/v1/users/${email}/labels?access_token=${token}`,
    {
      method: "GET",
    }
  );
  const labels = await response.json();
  return labels.labels;
}

async function setLabel(email, threadId, label) {
  const token = await getToken(email);
  let labelId;
  const labels = await fetchLabels(email);
  const existingLabel = labels.find((l) => l.name.toLowerCase() === label);
  if (existingLabel) {
    labelId = existingLabel.id;
  } else {
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/${email}/labels?access_token=${token}`,
      {
        method: "POST",
        body: JSON.stringify({
          name: label,
        }),
      }
    );
    const newLabel = await response.json();
    labelId = newLabel.id;
  }
  const response = await fetch(
    `https://www.googleapis.com/gmail/v1/users/${email}/threads/${threadId}/modify?access_token=${token}`,
    {
      method: "POST",
      body: JSON.stringify({
        addLabelIds: [labelId],
      }),
    }
  );
  const result = await response.json();
  return result;
}

async function fetchEmail(threadId, email) {
  const token = await getToken(email);
  const response = await fetch(
    `https://www.googleapis.com/gmail/v1/users/${email}/threads/${threadId}?access_token=${token}`,
    {
      method: "GET",
    }
  );
  const emailData = await response.json();
  return emailData;
}

async function generateText(prompt) {
  // call an openai api compatible llm
  const apiURL = await chrome.storage.sync.get("apiURL").apiURL;
  const apiKey = await chrome.storage.sync.get("apiKey").apiKey;

  if (`${apiURL}`.includes("openai")) {
    const response = await fetch(apiURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant labeling emails.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const json = await response.json();
    return json.choices["0"]?.message?.content;
  } else {
    const response = await fetch(apiURL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      method: "POST",
      body: JSON.stringify({
        inputs: `### System:
        You are a helpful assistant labeling emails.

        ### User:
        ${prompt.slice(0, 1000)}

        ### Assistant:
        `,
      }),
    });
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }
    return result;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "inboxsdk__injectPageWorld" && sender.tab) {
    if (chrome.scripting) {
      // MV3
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: "MAIN",
        files: ["pageWorld.js"],
      });
      sendResponse(true);
    } else {
      // MV2 fallback. Tell content script it needs to figure things out.
      sendResponse(false);
    }
  }

  // RCP for content.js
  if (message.action === "authorize") {
    authorize(message.email);
    return true;
  }

  if (message.action === "fetchLabels") {
    fetchLabels(message.email).then(sendResponse);
    return true; // This keeps the message channel open for async response.
  }

  if (message.action === "fetchEmail") {
    fetchEmail(message.threadId, message.email).then(sendResponse);
    return true;
  }

  if (message.action === "generateText") {
    generateText(message.prompt).then(sendResponse);
    return true;
  }

  if (message.action === "setLabel") {
    setLabel(message.email, message.threadId, message.label).then(sendResponse);
    return true;
  }
});

// Clear cache on install
chrome.runtime.onInstalled.addListener(async function () {
  const keys = await chrome.storage.sync.get(null);
  for (let key in keys) {
    await chrome.storage.sync.remove(key);
  }
  await chrome.storage.sync.set({
    apiURL: "https://api.openai.com/v1/chat/completions",
    apiKey: env.API_KEY,
  });
});

// Handle extension icon
chrome.action.onClicked.addListener(function () {
  chrome.windows.create({
    url: "index.html",
    width: 454,
    height: 540,
    type: "popup",
  });
});
