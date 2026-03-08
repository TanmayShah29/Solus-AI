/**
 * src/app/api/tools/weather/route.ts
 *
 * Weather tool using Open-Meteo API (Free, no key required).
 * Performs geocoding + weather forecast retrieval.
 */

import { env } from "@/lib/env";
import { traceable } from "langsmith/traceable";

function describeWeather(code: number): string {
    if (code === 0) return "Clear sky";
    if (code <= 3) return "Partly cloudy";
    if (code <= 48) return "Foggy";
    if (code <= 67) return "Rainy";
    if (code <= 77) return "Snowy";
    if (code <= 82) return "Showers";
    if (code <= 99) return "Thunderstorm";
    return "Unknown";
}

const POST_HANDLER = async (req: Request) => {
    const start = Date.now();

    try {
        // Auth check
        const authHeader = req.headers.get("authorization");
        if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { args } = await req.json();
        const { city } = args || {};

        if (!city) {
            return Response.json(
                { success: false, summary: "Missing city parameter", error: "Bad Request" },
                { status: 400 }
            );
        }

        // Step 1 — Geocode: Convert city name to coordinates
        let geoResponse = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
        );
        let geoData = await geoResponse.json();

        // Fallback: try just the city name without region
        if (!geoData.results?.length && city.includes(",")) {
            const cityOnly = city.split(",")[0].trim();
            geoResponse = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityOnly)}&count=1`
            );
            geoData = await geoResponse.json();
        }

        const location = geoData.results?.[0];

        if (!location) {
            return Response.json({
                success: false,
                result: null,
                summary: `City not found: ${city}`,
                duration_ms: Date.now() - start,
            });
        }

        const { latitude, longitude, name, country } = location;

        // Step 2 — Get weather: Current + 3-day forecast
        const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=3`
        );
        const weatherData = await weatherResponse.json();
        const current = weatherData.current;

        if (!current) {
            throw new Error("Failed to retrieve current weather data");
        }

        return Response.json({
            success: true,
            result: {
                city: `${name}, ${country}`,
                temperature_c: current.temperature_2m,
                humidity: current.relative_humidity_2m,
                wind_speed_kmh: current.wind_speed_10m,
                condition: describeWeather(current.weather_code),
                forecast: weatherData.daily.time.map((date: string, i: number) => ({
                    date,
                    max_c: weatherData.daily.temperature_2m_max[i],
                    min_c: weatherData.daily.temperature_2m_min[i],
                    precipitation_mm: weatherData.daily.precipitation_sum[i],
                })),
            },
            summary: `${name}: ${current.temperature_2m}°C, ${describeWeather(current.weather_code)}. Wind: ${current.wind_speed_10m} km/h.`,
            duration_ms: Date.now() - start,
        });
    } catch (error: any) {
        return Response.json({
            success: false,
            result: null,
            summary: `Weather tool failed: ${error.message}`,
            error: error.message,
            duration_ms: Date.now() - start,
        });
    }
};

export const POST = traceable(POST_HANDLER, { name: "tool_weather" });
