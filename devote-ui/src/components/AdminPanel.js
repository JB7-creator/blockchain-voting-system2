import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { collection, addDoc, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { hashPassword, validatePassword } from "../utils/security";
import { kenyaLocations } from "../data/kenyaLocations";
import { getPositionIndex } from "../utils/electionFilters";
import BulkVoterUpload from "./BulkVoterUpload";
import VoterRegistrationRequests from "./VoterRegistrationRequests";

const POSITIONS = [
  { value: "", label: "Select Position" },
  { value: "President", label: "President" },
  { value: "Governor", label: "Governor" },
  { value: "Senator", label: "Senator" },
  { value: "Woman Representative", label: "Woman Representative" },
  { value: "Member of Parliament", label: "Member of Parliament" },
  { value: "Member of County Assembly", label: "Member of County Assembly" },
];

const ADMIN_ROLES = [
  { value: "", label: "Select Role" },
  { value: "Super Admin", label: "Super Admin" },
  { value: "IEBC Admin", label: "IEBC Admin" },
  { value: "County Officer", label: "County Officer" },
  { value: "Constituency Officer", label: "Constituency Officer" },
];

const AdminPanel = ({
  account,
  candidates = [],
  electionStarted,
  electionEnded,
  isAdmin,
  adminAddress,
  isLoading = false,
  error = "",
  actionStatus = "",
  onAddCandidate,
  onStartElection,
  onEndElection,
  onRegisterVoter,
  onBulkRegisterVoters,
  onRefresh,
}) => {
  // Candidate form state
  const [candidateData, setCandidateData] = useState({
    name: "",
    party: "",
    candidateCode: "",
    position: "",
    county: "",
    constituency: "",
    ward: "",
    imageUrl: "",
  });

  // Admin management state
  const [adminUserData, setAdminUserData] = useState({
    username: "",
    walletAddress: "",
    password: "",
    confirmPassword: "",
    role: "",
  });
  const [adminUsers, setAdminUsers] = useState([]);
  const [passwordErrors, setPasswordErrors] = useState([]);

  const [voterAddress, setVoterAddress] = useState("");
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Derived location data
  const [availableConstituencies, setAvailableConstituencies] = useState([]);
  const [availableWards, setAvailableWards] = useState([]);

  // Debug logging
  useEffect(() => {
    console.log("Main contract admin:", adminAddress);
  }, [adminAddress]);

  // Update constituencies when county changes
  useEffect(() => {
    if (candidateData.county && candidateData.position !== "President") {
      const county = kenyaLocations.counties.find(
        (c) => c.name.toLowerCase() === candidateData.county.toLowerCase()
      );
      if (county && county.constituencies) {
        setAvailableConstituencies(county.constituencies.map((c) => c.name));
      } else {
        setAvailableConstituencies([]);
      }
      setCandidateData((prev) => ({ ...prev, constituency: "", ward: "" }));
      setAvailableWards([]);
    } else {
      setAvailableConstituencies([]);
      setAvailableWards([]);
    }
  }, [candidateData.county, candidateData.position]);

  // Update wards when constituency changes
  useEffect(() => {
    if (
      candidateData.county &&
      candidateData.constituency &&
      candidateData.position === "Member of County Assembly"
    ) {
      const county = kenyaLocations.counties.find(
        (c) => c.name.toLowerCase() === candidateData.county.toLowerCase()
      );
      if (county) {
        const constituency = county.constituencies.find(
          (c) => c.name.toLowerCase() === candidateData.constituency.toLowerCase()
        );
        if (constituency && constituency.wards) {
          setAvailableWards(constituency.wards);
        } else {
          setAvailableWards([]);
        }
      }
    } else {
      setAvailableWards([]);
    }
  }, [candidateData.constituency, candidateData.county, candidateData.position]);

  // Fetch admin users on mount
  useEffect(() => {
    fetchAdminUsers();
  }, []);

  const fetchAdminUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "adminUsers"));
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      setAdminUsers(users);
    } catch (error) {
      console.error("Error fetching admin users:", error);
      // Fallback to localStorage
      try {
        const stored = localStorage.getItem("adminUsers");
        if (stored) {
          setAdminUsers(JSON.parse(stored));
        }
      } catch (e) {
        console.error("Fallback to localStorage failed:", e);
      }
    }
  };

  const isBusy = isLoading || isUploading;

  // Check if current position requires location fields
  const getLocationRequirements = (position) => {
    switch (position) {
      case "President":
        return { showCounty: false, showConstituency: false, showWard: false, location: "National" };
      case "Governor":
      case "Senator":
      case "Woman Representative":
        return { showCounty: true, showConstituency: false, showWard: false, location: "County" };
      case "Member of Parliament":
        return { showCounty: true, showConstituency: true, showWard: false, location: "Constituency" };
      case "Member of County Assembly":
        return { showCounty: true, showConstituency: true, showWard: true, location: "Ward" };
      default:
        return { showCounty: false, showConstituency: false, showWard: false, location: "" };
    }
  };

  const locationReqs = getLocationRequirements(candidateData.position);

  const showError = (err) => {
    console.error(err);
    setStatus(`Error: ${err?.message || "Transaction failed"}`);
  };

  const handleRegisterVoter = async () => {
    const value = voterAddress.trim();

    if (!value) {
      setStatus("Please enter a wallet address");
      return;
    }

    if (!ethers.isAddress(value)) {
      setStatus("Please enter a valid Ethereum wallet address");
      return;
    }

    try {
      setStatus("Waiting for MetaMask confirmation...");
      await onRegisterVoter(value);
      setStatus("✅ Voter registered successfully");
      setVoterAddress("");
      await onRefresh?.();
    } catch (err) {
      showError(err);
    }
  };

  const handleAddCandidate = async () => {
    const name = candidateData.name.trim();
    const party = candidateData.party.trim();
    const candidateCode = candidateData.candidateCode.trim();
    const position = candidateData.position;

    // Debug logging
    console.log('[AdminPanel] handleAddCandidate called with:', {
      name,
      party,
      candidateCode,
      position,
      county: candidateData.county,
      constituency: candidateData.constituency,
      ward: candidateData.ward,
      imageUrl: candidateData.imageUrl,
    });
    console.log('[AdminPanel] Connected wallet:', account);
    console.log('[AdminPanel] Is admin:', isAdmin);
    console.log('[AdminPanel] Admin address:', adminAddress);

    // Validation
    if (!name) {
      setStatus("Please enter a candidate name");
      return;
    }

    if (!party) {
      setStatus("Please enter a candidate party");
      return;
    }

    if (!candidateCode) {
      setStatus("Please enter a candidate code");
      return;
    }

    if (!position) {
      setStatus("Please select a position");
      return;
    }

    // Location validation based on position
    if (position !== "President") {
      if (!candidateData.county) {
        setStatus("Please select a county");
        return;
      }
      if (
        (position === "Member of Parliament" || position === "Member of County Assembly") &&
        !candidateData.constituency
      ) {
        setStatus("Please select a constituency");
        return;
      }
      if (position === "Member of County Assembly" && !candidateData.ward) {
        setStatus("Please select a ward");
        return;
      }
    }

    // Build candidate location info
    const candidateLocation = {
      position,
      county: locationReqs.showCounty ? candidateData.county : "",
      constituency: locationReqs.showConstituency ? candidateData.constituency : "",
      ward: locationReqs.showWard ? candidateData.ward : "",
      location: locationReqs.location,
    };

    // CRITICAL FIX: Calculate positionIndex from position string
    // The smart contract requires positionIndex (0-5), not the position string
    const positionIndex = getPositionIndex(position);
    
    console.log('[AdminPanel] Calculated positionIndex:', positionIndex, 'for position:', position);

    if (positionIndex < 0 || positionIndex > 5) {
      setStatus(`Invalid position index: ${positionIndex}. Please select a valid position.`);
      return;
    }

    try {
      setStatus("Waiting for MetaMask confirmation...");

      // Call blockchain addCandidate with name and positionIndex
      // The useElection hook will handle the blockchain transaction and Firebase sync
      await onAddCandidate({
        name,
        party,
        candidateCode,
        position,
        positionIndex,  // CRITICAL: Pass the numeric position index
        county: candidateData.county,
        constituency: candidateData.constituency,
        ward: candidateData.ward,
        location: locationReqs.location,
        imageUrl: candidateData.imageUrl,
      });

      console.log('[AdminPanel] Candidate added successfully to blockchain');

      setStatus("✅ Candidate added successfully");
      setCandidateData({
        name: "",
        party: "",
        candidateCode: "",
        position: "",
        county: "",
        constituency: "",
        ward: "",
        imageUrl: "",
      });
      await onRefresh?.();
    } catch (err) {
      console.error('[AdminPanel] Error adding candidate:', err);
      console.error('[AdminPanel] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      showError(err);
    }
  };

  const handleStartElection = async () => {
    try {
      setStatus("Waiting for MetaMask confirmation...");
      await onStartElection();
      setStatus("✅ Election started successfully");
      await onRefresh?.();
    } catch (err) {
      showError(err);
    }
  };

  const handleEndElection = async () => {
    try {
      setStatus("Waiting for MetaMask confirmation...");
      await onEndElection();
      setStatus("✅ Election ended successfully");
      await onRefresh?.();
    } catch (err) {
      showError(err);
    }
  };

  const handleBulkUpload = async (file) => {
    if (!file) {
      setStatus("Please select a CSV or TXT file");
      return;
    }

    if (!onBulkRegisterVoters) {
      setStatus("Bulk voter upload is not connected in the frontend");
      return;
    }

    setIsUploading(true);

    try {
      setStatus("Uploading and processing voter list...");
      const result = await onBulkRegisterVoters(file);
      setStatus(
        `✅ Bulk upload completed${
          result?.count ? `: ${result.count} voter(s) registered` : ""
        }`
      );
      await onRefresh?.();
    } catch (err) {
      showError(err);
    } finally {
      setIsUploading(false);
    }
  };

  // Admin Management handlers
  const handleAdminPasswordChange = (value) => {
    setAdminUserData((prev) => ({ ...prev, password: value }));
    if (value) {
      const validation = validatePassword(value);
      setPasswordErrors(validation.errors);
    } else {
      setPasswordErrors([]);
    }
  };

  const handleAddAdminUser = async () => {
    const { username, walletAddress, password, confirmPassword, role } = adminUserData;

    // Validation
    if (!username.trim()) {
      setStatus("Please enter an admin username");
      return;
    }

    if (!walletAddress.trim()) {
      setStatus("Please enter an admin wallet address");
      return;
    }

    if (!ethers.isAddress(walletAddress)) {
      setStatus("Please enter a valid Ethereum wallet address");
      return;
    }

    if (!role) {
      setStatus("Please select a role");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match");
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setStatus(`Password validation failed: ${passwordValidation.errors.join(", ")}`);
      return;
    }

    try {
      setStatus("Creating admin user...");
      console.log("Creating admin user:", walletAddress, role);

      // Hash the password
      const passwordHash = await hashPassword(password);

      const adminRecord = {
        username: username.trim(),
        walletAddress: walletAddress.toLowerCase(),
        passwordHash,
        role,
        createdBy: account,
        createdAt: new Date().toISOString(),
        status: "active",
      };

      // Try Firestore first, fallback to localStorage
      try {
        await addDoc(collection(db, "adminUsers"), adminRecord);
        console.log("Admin user saved to Firestore");
      } catch (firestoreError) {
        console.warn("Firestore failed, using localStorage fallback:", firestoreError);
        // Fallback to localStorage
        const stored = localStorage.getItem("adminUsers");
        const users = stored ? JSON.parse(stored) : [];
        users.push({ ...adminRecord, id: Date.now().toString() });
        localStorage.setItem("adminUsers", JSON.stringify(users));
        console.log("Admin user saved to localStorage");
      }

      setStatus("✅ Admin user created successfully");
      setAdminUserData({
        username: "",
        walletAddress: "",
        password: "",
        confirmPassword: "",
        role: "",
      });
      setPasswordErrors([]);
      await fetchAdminUsers();
    } catch (err) {
      showError(err);
    }
  };

  const handleDeactivateAdmin = async (adminId) => {
    try {
      // Try Firestore first
      try {
        const adminRef = doc(db, "adminUsers", adminId);
        await updateDoc(adminRef, { status: "inactive", updatedAt: new Date().toISOString() });
      } catch (firestoreError) {
        // Fallback to localStorage
        const stored = localStorage.getItem("adminUsers");
        if (stored) {
          const users = JSON.parse(stored);
          const updatedUsers = users.map((u) =>
            u.id === adminId ? { ...u, status: "inactive" } : u
          );
          localStorage.setItem("adminUsers", JSON.stringify(updatedUsers));
        }
      }
      await fetchAdminUsers();
      setStatus("✅ Admin user deactivated");
    } catch (err) {
      showError(err);
    }
  };

  // Check if user is main contract admin or authorized secondary admin
  const AUTHORIZED_ADMINS = [
    "0x54feb9d84960bfb2cf7e52ac5c0106f93a28012b",
    "0x9dbeb02aa68e620304ad3b21f832434ea2e3bfc0",
  ];
  const isMainAdmin =
    isAdmin &&
    account &&
    ((adminAddress && account.toLowerCase() === adminAddress.toLowerCase()) ||
      AUTHORIZED_ADMINS.includes(account.toLowerCase()));

  // Show warning for non-main-admin users
  const showAdminWarning = isAdmin && !isMainAdmin;

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-red-200 p-6">
        <h2 className="text-2xl font-bold text-red-700 mb-2">
          Admin Panel Locked
        </h2>
        <p className="text-gray-700">
          Connect with the contract admin wallet to access admin privileges.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Admin Control Panel</h2>
        <div className="px-4 py-2 bg-green-100 text-green-800 text-sm font-medium rounded-full border border-green-200">
          Admin Privileges Active
        </div>
      </div>

      {showAdminWarning && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            ⚠️ This wallet has dashboard access, but blockchain admin actions require the main contract admin wallet.
          </p>
          <p className="text-sm text-yellow-700 mt-1">
            Main admin: {adminAddress || "Not detected"}
          </p>
        </div>
      )}

      <div className="mb-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Admin account:</span>{" "}
          {account || "Not connected"}
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-semibold">Candidates loaded:</span>{" "}
          {candidates.length}
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-semibold">Election started:</span>{" "}
          {electionStarted ? "Yes" : "No"}
        </p>
        <p className="text-sm text-gray-700 mt-1">
          <span className="font-semibold">Election ended:</span>{" "}
          {electionEnded ? "Yes" : "No"}
        </p>
      </div>

      <div className="mb-6 p-6 bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl">
        <h3 className="text-lg font-semibold text-green-900 mb-4">
          Register Voter
        </h3>

        <div className="flex gap-4">
          <input
            type="text"
            value={voterAddress}
            onChange={(e) => setVoterAddress(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-4 py-3 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            disabled={isBusy}
          />
          <button
            onClick={handleRegisterVoter}
            disabled={isBusy || !voterAddress.trim()}
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isLoading ? "Processing..." : "Register"}
          </button>
        </div>
      </div>

      {/* Add Candidate Section with Location Dropdowns */}
      <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">
          Add Candidate
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Candidate Name *
            </label>
            <input
              type="text"
              value={candidateData.name}
              onChange={(e) => setCandidateData({...candidateData, name: e.target.value})}
              placeholder="Full name..."
              className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={isBusy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Party *
            </label> 
            <input
              type="text"
              value={candidateData.party}
              onChange={(e) => setCandidateData({...candidateData, party: e.target.value})}
              placeholder="Political party..."
              className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={isBusy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Candidate Code *
            </label>
            <input
              type="text"
              value={candidateData.candidateCode}
              onChange={(e) => setCandidateData({...candidateData, candidateCode: e.target.value})}
              placeholder="Unique candidate code..."
              className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={isBusy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Position *
            </label>
            <select
              value={candidateData.position}
              onChange={(e) => setCandidateData({
                ...candidateData,
                position: e.target.value,
                county: "",
                constituency: "",
                ward: "",
              })}
              className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              disabled={isBusy}
            >
              {POSITIONS.map((pos) => (
                <option key={pos.value} value={pos.value}>
                  {pos.label}
                </option>
              ))}
            </select>
          </div>

          {/* County dropdown - shown for non-President positions */}
          {locationReqs.showCounty && (
            <div>
              <label className="block text-sm font-medium text-blue-700 mb-2">
                County *
              </label>
              <select
                value={candidateData.county}
                onChange={(e) => setCandidateData({
                  ...candidateData,
                  county: e.target.value,
                  constituency: "",
                  ward: "",
                })}
                className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                disabled={isBusy}
              >
                <option value="">Select County</option>
                {kenyaLocations.counties.map((county) => (
                  <option key={county.id} value={county.name}>
                    {county.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Constituency dropdown - shown for MP and MCA positions */}
          {locationReqs.showConstituency && (
            <div>
              <label className="block text-sm font-medium text-blue-700 mb-2">
                Constituency *
              </label>
              <select
                value={candidateData.constituency}
                onChange={(e) => setCandidateData({
                  ...candidateData,
                  constituency: e.target.value,
                  ward: "",
                })}
                className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                disabled={isBusy || availableConstituencies.length === 0}
              >
                <option value="">Select Constituency</option>
                {availableConstituencies.map((constituency) => (
                  <option key={constituency} value={constituency}>
                    {constituency}
                  </option>
                ))}
              </select>
              {availableConstituencies.length === 0 && candidateData.county && (
                <p className="text-xs text-blue-600 mt-1">
                  No constituencies found for selected county
                </p>
              )}
              {availableConstituencies.length === 0 && !candidateData.county && (
                <p className="text-xs text-blue-600 mt-1">
                  Please select a county first
                </p>
              )}
            </div>
          )}

          {/* Ward dropdown - shown only for MCA position */}
          {locationReqs.showWard && (
            <div>
              <label className="block text-sm font-medium text-blue-700 mb-2">
                Ward *
              </label>
              <select
                value={candidateData.ward}
                onChange={(e) => setCandidateData({...candidateData, ward: e.target.value})}
                className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                disabled={isBusy || availableWards.length === 0}
              >
                <option value="">Select Ward</option>
                {availableWards.map((ward) => (
                  <option key={ward} value={ward}>
                    {ward}
                  </option>
                ))}
              </select>
              {availableWards.length === 0 && candidateData.constituency && (
                <p className="text-xs text-blue-600 mt-1">
                  No wards found for selected constituency
                </p>
              )}
              {availableWards.length === 0 && !candidateData.constituency && (
                <p className="text-xs text-blue-600 mt-1">
                  Please select a constituency first
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-blue-700 mb-2">
              Image URL
            </label>
            <input
              type="url"
              value={candidateData.imageUrl}
              onChange={(e) => setCandidateData({...candidateData, imageUrl: e.target.value})}
              placeholder="https://example.com/image.jpg"
              className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={isBusy}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleAddCandidate}
            disabled={isBusy || !candidateData.name.trim() || !candidateData.party.trim() || !candidateData.candidateCode.trim() || !candidateData.position}
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Add Candidate"}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <BulkVoterUpload isLoading={isBusy} onUpload={handleBulkUpload} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <button
          onClick={handleStartElection}
          disabled={isBusy || electionStarted}
          className="p-6 bg-green-100 rounded-xl hover:shadow-lg disabled:opacity-50"
        >
          {electionStarted ? "Election Already Started" : "▶ Start Election"}
        </button>

        <button
          onClick={handleEndElection}
          disabled={isBusy || !electionStarted || electionEnded}
          className="p-6 bg-red-100 rounded-xl hover:shadow-lg disabled:opacity-50"
        >
          {electionEnded ? "Election Already Ended" : "⏹ End Election"}
        </button>
      </div>

      {/* Admin Management Section - Only for main contract admin */}
      {isMainAdmin && (
        <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl">
          <h3 className="text-lg font-semibold text-purple-900 mb-4">
            Admin Management
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-2">
                Admin Username *
              </label>
              <input
                type="text"
                value={adminUserData.username}
                onChange={(e) => setAdminUserData({...adminUserData, username: e.target.value})}
                placeholder="Enter username..."
                className="w-full px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                disabled={isBusy}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-2">
                Admin Wallet Address *
              </label>
              <input
                type="text"
                value={adminUserData.walletAddress}
                onChange={(e) => setAdminUserData({...adminUserData, walletAddress: e.target.value})}
                placeholder="0x..."
                className="w-full px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                disabled={isBusy}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-2">
                Password *
              </label>
              <input
                type="password"
                value={adminUserData.password}
                onChange={(e) => handleAdminPasswordChange(e.target.value)}
                placeholder="Enter strong password..."
                className="w-full px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                disabled={isBusy}
              />
              {passwordErrors.length > 0 && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {passwordErrors.map((err, idx) => (
                    <div key={idx}>• {err}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-purple-700 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                value={adminUserData.confirmPassword}
                onChange={(e) => setAdminUserData({...adminUserData, confirmPassword: e.target.value})}
                placeholder="Confirm password..."
                className="w-full px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                disabled={isBusy}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-purple-700 mb-2">
                Role *
              </label>
              <select
                value={adminUserData.role}
                onChange={(e) => setAdminUserData({...adminUserData, role: e.target.value})}
                className="w-full px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                disabled={isBusy}
              >
                {ADMIN_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleAddAdminUser}
            disabled={isBusy || !adminUserData.username.trim() || !adminUserData.walletAddress.trim() || !adminUserData.password || !adminUserData.role}
            className="px-8 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            {isLoading ? "Processing..." : "Create Admin User"}
          </button>

          {/* Admin Users Table */}
          {adminUsers.length > 0 && (
            <div className="overflow-x-auto">
              <h4 className="text-md font-semibold text-purple-900 mb-3">
                Existing Admin Users
              </h4>
              <table className="w-full bg-white rounded-lg overflow-hidden">
                <thead className="bg-purple-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-purple-900">Username</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-purple-900">Wallet Address</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-purple-900">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-purple-900">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-purple-900">Created</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-purple-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((admin, index) => (
                    <tr key={admin.id || index} className="border-b border-purple-100 hover:bg-purple-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{admin.username}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                        {admin.walletAddress?.slice(0, 10)}...{admin.walletAddress?.slice(-8)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{admin.role}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          admin.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {admin.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : "N/A"}
                      </td>
                      <td className="px-4 py-3">
                        {admin.status === "active" && (
                          <button
                            onClick={() => handleDeactivateAdmin(admin.id)}
                            className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200"
                            disabled={isBusy}
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Voter Registration Requests Section */}
      <div className="mt-8">
        <VoterRegistrationRequests onApproveVoter={onRegisterVoter} />
      </div>

      {(status || actionStatus) && (
        <div className="p-4 rounded-xl border bg-yellow-50 text-yellow-800 mt-4">
          {status || actionStatus}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border bg-red-50 text-red-800 mt-4">
          {error}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;