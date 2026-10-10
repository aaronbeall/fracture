// Toolbar click or Alt+Shift+F injects the effect; a second press restores the page.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ["fracture-anywhere.js"],
    })
    .catch((error) => console.warn("Fracture cannot run on this page", error));
});
