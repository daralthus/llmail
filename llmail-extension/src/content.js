import * as InboxSDK from "@inboxsdk/core";
import env from "../.env.json";
import { decode as decodeBase64 } from "js-base64";

async function fetchLabels(email) {
  return await chrome.runtime.sendMessage({
    action: "fetchLabels",
    email: email,
  });
}

async function setLabel(email, threadId, label) {
  return await chrome.runtime.sendMessage({
    action: "setLabel",
    email: email,
    threadId: threadId,
    label: label,
  });
}

async function generateText(prompt) {
  // call an openai api compatible llm
  const apiURL = (await chrome.storage.sync.get("apiURL")).apiURL;
  const apiKey = (await chrome.storage.sync.get("apiKey")).apiKey;
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
            content: prompt.slice(0, 1000),
          },
        ],
      }),
    });

    const json = await response.json();
    return json.choices["0"]?.message?.content;
  } else {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/Riiid/sheep-duck-llama-2",
      {
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
      }
    );
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }
    return result;
  }
}

function decode(text, encoding, contentType) {
  let decodedText = "";
  switch (encoding.value) {
    case "7bit":
      decodedText = text;
      break;
    case "quoted-printable":
      decodedText = text.replace(/=(?=[0-9A-F]{2})/gi, "%");
      break;
    default:
      decodedText = text;
  }
  return decodedText;
}

function getPlainText(email) {
  let plainText = "";
  email.messages[0].payload.parts.forEach((part) => {
    const contentType = part.headers.find((x) => x.name === "Content-Type");
    const encoding = part.headers.find(
      (x) => x.name === "Content-Transfer-Encoding"
    );
    const body = decodeBase64(part.body.data);
    if (part.mimeType === "text/plain") {
      plainText = decode(body, encoding, contentType);
    }
    if (plainText === "" && part.mimeType === "text/html") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(body, "text/html");
      plainText = doc.body.textContent || "";
    }
  });
  return plainText;
}

function showModal(sdk) {
  let mole = sdk.Widgets.showMoleView({
    title: "llmail",
    className: "llmail_mole",
    el: (() => {
      const form = document.createElement("form");
      const button = document.createElement("button");
      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.cols = 50;
      textarea.value =
        "Which label matches this email? Reply with exactly ONE of the following and nothing else: 'work', 'school', 'personal', 'other'";
      button.type = "submit";
      button.textContent = "Apply";
      button.onclick = function () {
        runPrompt(sdk, mole, textarea.value);
      };

      form.appendChild(textarea);
      form.appendChild(button);
      return form;
    })(),
  });
}

async function runPrompt(sdk, mole, prompt) {
  const emailAddress = await sdk.User.getEmailAddress();
  const selectedThreads = sdk.Lists.getSelectedThreadRowViews();
  selectedThreads.forEach(async (thread) => {
    const threadId = await thread.getThreadIDAsync();
    const subject = thread.getSubject();
    const email = await chrome.runtime.sendMessage({
      action: "fetchEmail",
      email: emailAddress,
      threadId: threadId,
    });

    // Generate the label based on the subject
    const label = await generateText(
      `${prompt}\n Subject: ${subject}\n Email: ${getPlainText(email)}\n\n`
    );
    // Apply the label to the thread
    await setLabel(emailAddress, threadId, label);

    // temp until list refreshes
    thread.addLabel({ title: label });
    thread.deselect();
  });

  // Close mole view
  await mole.close();
}

InboxSDK.load(2, env.APP_ID).then(async (sdk) => {
  sdk.Toolbars.registerThreadButton({
    title: "Label with LLM",
    iconUrl: chrome.runtime.getURL("icon.png"),
    positions: ["LIST"],
    onClick: async (event) => {
      showModal(sdk);
    },
  });
});
