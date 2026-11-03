import { supabase } from "./supabase-client.js";

const form = document.querySelector("#login-form");
const note = document.querySelector("#status-note");
const strikeNote = document.querySelector("#strike-note");
const button = document.querySelector("#login-button");

async function enterShop() {
  const root = document.querySelector("#shop-app");
  if (!root) throw new Error("Shop container #shop-app is missing from the page.");
  root.style.display = "block";
  try {
    await import("./shop.js?v=nightshop-exterior-upload-3");
  } catch (error) {
    root.style.display = "none";
    throw error;
  }
  document.querySelector("#login-door")?.classList.add("hidden");
  document.querySelector("#street-scene")?.classList.add("hidden");
  document.querySelector(".crest")?.classList.add("hidden");
  document.querySelector("header h1")?.classList.add("hidden");
  document.querySelector(".subtitle")?.classList.add("hidden");
}

// Load the public exterior artwork on the entrance screen, before sign-in.
const exteriorImage = document.querySelector("#exterior-artwork");
if (exteriorImage) {
  const { data: exteriorUrl } = supabase.storage.from("nightshop-artwork").getPublicUrl("exterior/current");
  exteriorImage.onload = () => document.querySelector("#street-scene")?.classList.add("artwork-mode");
  exteriorImage.onerror = () => document.querySelector("#street-scene")?.classList.remove("artwork-mode");
  exteriorImage.src = exteriorUrl.publicUrl + "?v=" + Date.now();
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  note.textContent = "Checking credentials...";
  let stage = "sending login request";
  try {
    const response = await fetch("https://yppuanqofgpiskffiyvf.supabase.co/functions/v1/member-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcHVhbnFvZmdwaXNrZmZpeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MTI1MDgsImV4cCI6MjEwOTI4ODUwOH0.tYoFrt1PQ7Ur-XioMyb_SzdDnJwjNUcJw3VXPy_zQAI",
      },
      body: JSON.stringify({
        username: form.elements.username.value.trim(),
        password: form.elements.password.value
      })
    });

    stage = "reading login response";
    const result = await response.json();
    if (response.ok && result.session) {
      stage = "saving your login session";
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
      strikeNote.textContent = "Strikes: 0 / 3";
      note.textContent = "Access granted. Opening the shop...";
      stage = "opening the shop";
      await enterShop();
      return;
    }

    strikeNote.textContent = "Strikes: " + Number(result.strikes || 0) + " / 3";
    if (result.locked) {
      note.textContent = "Locked out. Try again in about " +
        Math.ceil(Number(result.retry_after || 0) / 60) + " minute(s).";
    } else {
      note.textContent = result.error || "Sign-in failed.";
    }
  } catch (error) {
    console.error("Night Shop login error during " + stage + ":", error);
    if (stage === "opening the shop") {
      note.textContent = "Your login worked, but the shop could not load. " + (error?.message || "Please try again.");
    } else {
      note.textContent = "Problem while " + stage + ". " + (error?.message || "Please try again.");
    }
    const loginDoor = document.querySelector("#login-door");
    if (loginDoor) loginDoor.style.display = "block";
  } finally {
    button.disabled = false;
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  try {
    await enterShop();
  } catch (error) {
    console.error("Night Shop session restore error:", error);
    const loginDoor = document.querySelector("#login-door");
    if (loginDoor) loginDoor.style.display = "block";
    if (note) note.textContent = "Your session is saved, but the shop could not load. " + (error?.message || "");
  }
}
