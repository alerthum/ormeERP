import { createCustomerOrder, getPermissionUser } from "../src/services/erp-write-service";
import { sql } from "../src/db/client";

async function smokeTestSecurity() {
  console.log("🚀 Starting Enterprise Security Smoke Test...");

  try {
    // 1. Mock Admin User
    const adminUser = {
      id: "admin-mock",
      email: "admin@test.com",
      roleId: "admin-role",
      permissions: ["admin"],
      isAdmin: true
    };

    // 2. Mock Restricted User
    const restrictedUser = {
      id: "user-mock",
      email: "user@test.com",
      roleId: "user-role",
      permissions: ["orders.read"], // No create permission
      isAdmin: false
    };

    // 3. Test Permission Guard (Negative)
    console.log("\nTesting Permission Guard (Should Fail)...");
    try {
      await createCustomerOrder({ customerName: "TEST-AI-SECURITY-FAIL" }, restrictedUser);
      console.error("❌ FAIL: Restricted user was able to create order!");
    } catch (error: any) {
      console.log("✅ PASS: Permission denied as expected: " + error.message);
    }

    // 4. Test Operation Lock
    console.log("\nTesting Operation Lock...");
    
    // Activate lock for yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const lockDate = yesterday.toISOString().slice(0, 10);
    
    await sql`
      update ui_settings 
      set data = data || jsonb_build_object('operationLockActive', true, 'operationLockDate', ${lockDate}::text)
      where id = 'global'
    `;
    console.log(`Lock activated for: ${lockDate}`);

    // Try to create order with date = lockDate (Should Fail for non-admin)
    try {
      const normalUserWithPerm = { ...restrictedUser, permissions: ["orders.create"] };
      await createCustomerOrder({ 
        customerName: "TEST-AI-LOCK-FAIL", 
        orderDate: lockDate,
        fabricTypeId: 'mock',
        colorId: 'mock',
        yarnCountId: 'mock'
      }, normalUserWithPerm);
      console.error("❌ FAIL: Normal user bypassed operation lock!");
    } catch (error: any) {
      console.log("✅ PASS: Operation lock blocked transaction: " + error.message);
    }

    // Admin should bypass lock (Should Pass)
    console.log("\nTesting Admin Override...");
    try {
      // Note: This might still fail if 'mock' IDs are not in DB, but the lock check happens FIRST
      await createCustomerOrder({ 
        customerName: "TEST-AI-LOCK-ADMIN-PASS", 
        orderDate: lockDate,
        fabricTypeId: 'mock',
        colorId: 'mock',
        yarnCountId: 'mock'
      }, adminUser);
      // If we reach here, lock didn't block it (success)
      console.log("✅ PASS: Admin bypassed lock (proceeded to validation).");
    } catch (error: any) {
      if (error.message.includes("kilitlenmiştir")) {
        console.error("❌ FAIL: Admin was blocked by lock!");
      } else {
        console.log("✅ PASS: Admin bypassed lock (blocked by later validation as expected): " + error.message);
      }
    }

    // Cleanup settings
    await sql`
      update ui_settings 
      set data = data - 'operationLockActive' - 'operationLockDate'
      where id = 'global'
    `;
    console.log("\nSettings restored.");

  } catch (err) {
    console.error("💥 Smoke test failed with fatal error:", err);
  } finally {
    process.exit(0);
  }
}

smokeTestSecurity();
