const form = document.querySelector("#donation-form");
const photoInput = document.querySelector("#photo");
const fileName = document.querySelector("#file-name");
const list = document.querySelector("#donation-list");
const emptyState = document.querySelector("#empty-state");
const listingCount = document.querySelector("#listing-count");
const totalCount = document.querySelector("#total-count");
const formMessage = document.querySelector("#form-message");
const searchInput = document.querySelector("#search-input");
const cityFilter = document.querySelector("#city-filter");
const noResults = document.querySelector("#no-results");
const themeToggle = document.querySelector("#theme-toggle");
let donations = [];

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not connect to DaanSetu server.");
  return data;
}
function escapeHtml(value) { const element = document.createElement("div"); element.textContent = value; return element.innerHTML; }
function cleanPhoneNumber(value) { return value.replace(/[^\d+]/g, "").replace(/^00/, "+"); }
function updateCityOptions() {
  const currentCity = cityFilter.value;
  const cities = [...new Set(donations.map((donation) => donation.city))].sort((first, second) => first.localeCompare(second));
  cityFilter.innerHTML = '<option value="">All cities</option>' + cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join("");
  cityFilter.value = cities.includes(currentCity) ? currentCity : "";
}
function renderDonations() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedCity = cityFilter.value;
  const filtered = donations.filter((donation) => {
    const matchesSearch = !searchTerm || donation.itemName.toLowerCase().includes(searchTerm) || donation.city.toLowerCase().includes(searchTerm);
    return matchesSearch && (!selectedCity || donation.city === selectedCity);
  });
  emptyState.hidden = donations.length > 0;
  noResults.hidden = donations.length === 0 || filtered.length > 0;
  list.innerHTML = filtered.map((donation, index) => {
    const phone = cleanPhoneNumber(donation.whatsapp).replace("+", "");
    const message = encodeURIComponent(`Hi, I am interested in the ${donation.itemName} you listed on DaanSetu.`);
    const photo = donation.photo ? `<div class="card-photo-wrap"><img class="card-photo" src="${donation.photo}" alt="${escapeHtml(donation.itemName)}" /></div>` : "";
    return `<article class="donation-card" style="animation-delay: ${index * 70}ms">${photo}<div class="card-content"><div class="card-meta"><p class="card-city">${escapeHtml(donation.city)}</p><span class="available-badge"><span aria-hidden="true"></span> Available</span></div><h3 class="card-title">${escapeHtml(donation.itemName)}</h3><p class="card-description">${escapeHtml(donation.description)}</p><div class="card-actions"><a class="whatsapp-button" href="https://wa.me/${phone}?text=${message}" target="_blank" rel="noopener">Ask on WhatsApp <span aria-hidden="true">&#8599;</span></a></div></div></article>`;
  }).join("");
  listingCount.textContent = `${filtered.length} ${filtered.length === 1 ? "item" : "items"}`;
  totalCount.textContent = `${donations.length} total ${donations.length === 1 ? "donation" : "donations"}`;
}
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Please choose an image smaller than 5MB."));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The photo could not be read. Please try again."));
    reader.readAsDataURL(file);
  });
}
async function loadDonations() {
  try { donations = (await request("/api/donations")).donations; updateCityOptions(); renderDonations(); }
  catch (error) { formMessage.textContent = "Start the DaanSetu server to load live donations."; }
}
photoInput.addEventListener("change", () => { fileName.textContent = photoInput.files[0]?.name || ""; });
form.addEventListener("submit", async (event) => {
  event.preventDefault(); formMessage.textContent = "";
  const submitButton = form.querySelector("button[type=submit]"); submitButton.disabled = true; submitButton.textContent = "Posting...";
  const data = new FormData(form);
  try {
    const donation = { itemName: data.get("itemName").trim(), description: data.get("description").trim(), city: data.get("city").trim(), whatsapp: data.get("whatsapp").trim(), photo: await readPhoto(photoInput.files[0]) };
    await request("/api/donations", { method: "POST", body: JSON.stringify(donation) });
    form.reset(); fileName.textContent = ""; formMessage.textContent = "Donation submitted for admin approval."; await loadDonations();
  } catch (error) { formMessage.textContent = error.message; }
  finally { submitButton.disabled = false; submitButton.innerHTML = 'Post donation <span aria-hidden="true">&#8594;</span>'; }
});
searchInput.addEventListener("input", renderDonations);
cityFilter.addEventListener("change", renderDonations);
const savedTheme = localStorage.getItem("daansetu-theme");
if (savedTheme === "dark") document.body.classList.add("dark-mode");
function updateThemeButton() { const darkMode = document.body.classList.contains("dark-mode"); themeToggle.setAttribute("aria-pressed", String(darkMode)); themeToggle.setAttribute("aria-label", darkMode ? "Switch to light mode" : "Switch to dark mode"); themeToggle.innerHTML = `<span aria-hidden="true">${darkMode ? "&#9788;" : "&#9790;"}</span>`; }
themeToggle.addEventListener("click", () => { document.body.classList.toggle("dark-mode"); localStorage.setItem("daansetu-theme", document.body.classList.contains("dark-mode") ? "dark" : "light"); updateThemeButton(); });
updateThemeButton();
loadDonations();
