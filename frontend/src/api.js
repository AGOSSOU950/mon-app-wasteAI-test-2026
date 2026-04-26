import axios from "axios"

const API_URL = import.meta.env.VITE_API_URL || "https://wasteai-api.wasteai-gildas.workers.dev"

console.log("API URL:", API_URL)
console.log("Mode:", import.meta.env.MODE)

export const API_BASE = API_URL.replace(/\/$/, "")

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})
