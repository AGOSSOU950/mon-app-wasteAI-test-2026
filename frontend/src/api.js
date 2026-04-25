import axios from "axios"

export const API_BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001").replace(/\/$/, "")

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})
