import { useEffect, useState } from "react";
import { fetchWeather } from "../services/weatherService";

/**
 * Weather hook
 * Handles IP weather + user-selected city
 */
export function useWeather() {
  const [weather, setWeather] = useState<any>(null);

  useEffect(() => {
    // Default to a sane city on first load; this avoids needing IP geolocation.
    fetchWeather("Tel Aviv").then(setWeather);
  }, []);

  async function selectCity(city: string) {
    const result = await fetchWeather(city);
    setWeather(result);
  }

  return { weather, selectCity };
}
