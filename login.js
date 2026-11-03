import { supabase } from "./supabase-client.js";

const form = document.querySelector("#login-form");
const note = document.querySelector("#status-note");
const strikeNote = document.querySelector("#strike-note");
const button = document.querySelector("#login-button");

async function enterShop() {
  document.querySelector("#login-door")?.classList.add("hidden");
  document.querySelector(".crest")?.classList.add("hidden");
  document.querySelector("header h1")?.classList.add("hidden");
  document.querySelector(".subtitle")?.classList.add("hidden");
  document.querySelector("#shop-app").style.display = "block";
  await import("./shop.js");
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  note.textContent = "Checking credentials...";
  try {
    const response = await fetch("https://yppuanqofgpiskffiyvf.supabase.co/functions/v1/member-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "sb_publishable_J_prDGvoCdlL3QI1SoYebg_OCnjqNQZ"
      },
      body: JSON.stringify({
        username: form.elements.username.value.trim(),
        password: form.elements.password.value
      })
    });
    const result = await response.json();
    if (response.ok && result.session) {
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
      strikeNote.textContent = "Strikes: 0 / 3";
      note.textContent = "Access granted.";
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
    console.error(error);
    note.textContent = "Unable to sign in right now. Please try again.";
  } finally {
    button.disabled = false;
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session) await enterShop();