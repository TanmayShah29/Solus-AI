// scripts/verify-redis.ts
import 'dotenv/config'
import { redis } from '../src/lib/redis/client'

async function verify() {
    console.log('Testing Redis connection...')
    try {
        const testKey = 'solus:test'
        const testValue = 'connected'

        // Set test key with 60s expiration
        await redis.set(testKey, testValue, { ex: 60 })

        // Get test key back
        const value = await redis.get(testKey)

        if (value === testValue) {
            console.log(`✅ Redis — connected. Test key value: ${value}`)
        } else {
            console.log(`❌ Redis — data mismatch. Expected "${testValue}", got "${value}"`)
        }
    } catch (error) {
        console.error(`❌ Redis — FAILED. Reason: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
    }
}

verify().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
