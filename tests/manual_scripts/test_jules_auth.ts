#!/usr/bin/env npx tsx
/**
 * Test different auth methods for Jules API
 */

const JULES_API_KEY = process.env.JULES_API_KEY;
const API_BASE = "https://jules.googleapis.com/v1alpha";

async function testAuth() {
    console.log("Testing Jules API authentication methods...\n");

    if (!JULES_API_KEY) {
        console.error("❌ JULES_API_KEY not set");
        return;
    }

    console.log("API Key (first 20 chars):", JULES_API_KEY.substring(0, 20) + "...");

    // Method 1: x-goog-api-key header (lowercase - correct format)
    console.log("\n1. Testing x-goog-api-key header (lowercase)...");
    try {
        const res1 = await fetch(`${API_BASE}/sources`, {
            headers: { "x-goog-api-key": JULES_API_KEY }
        });
        console.log(`   Status: ${res1.status}`);
        if (!res1.ok) {
            const error = await res1.text();
            console.log(`   Error: ${error.substring(0, 200)}...`);
        } else {
            console.log("   ✓ Success!");
            const data = await res1.json();
            console.log(`   Found ${data.sources?.length || 0} sources`);
        }
    } catch (e: any) {
        console.log(`   ✗ Failed: ${e.message}`);
    }

    // Method 2: Authorization Bearer header
    console.log("\n2. Testing Authorization: Bearer header...");
    try {
        const res2 = await fetch(`${API_BASE}/sources`, {
            headers: { "Authorization": `Bearer ${JULES_API_KEY}` }
        });
        console.log(`   Status: ${res2.status}`);
        if (!res2.ok) {
            const error = await res2.text();
            console.log(`   Error: ${error.substring(0, 200)}...`);
        } else {
            console.log("   ✓ Success!");
            const data = await res2.json();
            console.log(`   Found ${data.sources?.length || 0} sources`);
        }
    } catch (e: any) {
        console.log(`   ✗ Failed: ${e.message}`);
    }

    // Method 3: x-goog-api-key query parameter
    console.log("\n3. Testing API key as query parameter...");
    try {
        const res3 = await fetch(`${API_BASE}/sources?key=${JULES_API_KEY}`);
        console.log(`   Status: ${res3.status}`);
        if (!res3.ok) {
            const error = await res3.text();
            console.log(`   Error: ${error.substring(0, 200)}...`);
        } else {
            console.log("   ✓ Success!");
        }
    } catch (e: any) {
        console.log(`   ✗ Failed: ${e.message}`);
    }
}

testAuth();
