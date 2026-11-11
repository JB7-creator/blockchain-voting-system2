import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";

// Authorized admin wallets (Contract owner and authorized secondary admin / relayer)
const AUTHORIZED_ADMINS = [
  "0x54feb9d84960bfb2cf7e52ac5c0106f93a28012b", // Main on-chain admin
  "0x9dbeb02aa68e620304ad3b21f832434ea2e3bfc0", // Secondary admin / relayer wallet
];

const useAdmin = (contract, account) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAddress, setAdminAddress] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const checkAdmin = useCallback(async () => {
    console.log("🔍 Checking admin status...");
    console.log("Contract instance exists:", !!contract);
    console.log("Connected account:", account);
    console.log("Account type:", typeof account);

    if (!account) {
      console.log("❌ Missing account, setting isAdmin to false");
      setIsAdmin(false);
      setError("");
      return false;
    }

    const normalizedAccount = String(account).toLowerCase().trim();
    const isWhitelisted = AUTHORIZED_ADMINS.includes(normalizedAccount);

    setIsLoading(true);
    setError("");

    try {
      let fetchedAdminAddress = null;
      if (contract) {
        try {
          console.log("📋 Fetching admin address from contract...");
          fetchedAdminAddress = await contract.admin();
          console.log("📋 Admin address from contract:", fetchedAdminAddress);
        } catch (contractErr) {
          console.warn("Could not fetch contract admin:", contractErr);
        }
      }

      const normalizedAdmin = fetchedAdminAddress
        ? String(fetchedAdminAddress).toLowerCase().trim()
        : AUTHORIZED_ADMINS[0];

      const currentIsAdmin = isWhitelisted || normalizedAdmin === normalizedAccount;

      console.log("🎯 Final admin check result:", currentIsAdmin);
      console.log("🎯 Admin address:", fetchedAdminAddress || normalizedAdmin);
      console.log("🎯 Connected account:", account);
      console.log("🎯 Authorized match:", isWhitelisted);

      setAdminAddress(fetchedAdminAddress || normalizedAdmin);
      setIsAdmin(currentIsAdmin);
      return currentIsAdmin;
    } catch (err) {
      console.error("❌ Failed to check admin:", err);

      if (isWhitelisted) {
        setIsAdmin(true);
        setAdminAddress(normalizedAccount);
        return true;
      }

      setIsAdmin(false);
      setError(err?.message || "Failed to verify admin status");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [contract, account]);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  return {
    isAdmin,
    adminAddress,
    isLoading,
    error,
    checkAdmin,
  };
};

export default useAdmin;
