import axios from "axios"

export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "")

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

