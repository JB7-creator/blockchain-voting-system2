import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { collection, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getAllCandidateProfiles, saveCandidateProfile } from "../services/candidateService";
import { POSITION_INDEX, normalizePosition, getPositionIndex } from "../utils/electionFilters";

const getReadableError = (err, fallback) => {
  const message =
    err?.reason ||
    err?.shortMessage ||
    err?.info?.error?.message ||
    err?.message ||
    fallback;

  const lower = String(message).toLowerCase();

  if (lower.includes("user rejected")) return "Transaction rejected by user";
  if (lower.includes("insufficient funds")) return "Insufficient funds";
  if (lower.includes("only admin")) return "Only admin can perform this action";
  if (lower.includes("invalid address")) return "Invalid wallet address";
  if (lower.includes("already registered")) return "Voter already registered";
  if (lower.includes("not a registered voter")) return "You are not registered";
  if (lower.includes("already voted for this position")) return "You have already voted in this position";
  if (lower.includes("already voted")) return "You already voted";
  if (lower.includes("election not started")) return "Election not started";
  if (lower.includes("election ended")) return "Election ended";
  if (lower.includes("missing revert data")) return fallback;

  return message || fallback;
};

const normalizeAddressesFromText = (text) => {
  if (!text || typeof text !== "string") return [];

  const raw = text
    .split(/[\n,\r\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const unique = [];
  const seen = new Set();

  for (const addr of raw) {
    if (ethers.isAddress(addr)) {
      const normalized = addr.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(addr);
      }
    }
  }

  return unique;
};

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

const useElection = (contract) => {
  const [candidates, setCandidates] = useState([]);
  const [electionStarted, setElectionStarted] = useState(null);
  const [electionEnded, setElectionEnded] = useState(null);
  const [admin, setAdmin] = useState(null);
  // candidateProfiles is used internally for merging, not exported
  const [_candidateProfiles, setCandidateProfiles] = useState([]);

  const [voterInfo, setVoterInfo] = useState({
    isRegistered: null,
    hasVoted: null,
    votedFor: null,
    // Position-based voting status
    hasVotedPresident: null,
    hasVotedGovernor: null,
    hasVotedSenator: null,
    hasVotedWomanRep: null,
    hasVotedMP: null,
    hasVotedMCA: null,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionStatus, setActionStatus] = useState("");

  const resetVoterInfo = () => {
    setVoterInfo({
      isRegistered: null,
      hasVoted: null,
      votedFor: null,
      hasVotedPresident: null,
      hasVotedGovernor: null,
      hasVotedSenator: null,
      hasVotedWomanRep: null,
      hasVotedMP: null,
      hasVotedMCA: null,
    });
  };

  const loadElectionData = useCallback(async () => {
    if (!contract) return;

    setIsLoading(true);
    setError("");

    try {
      const count = Number(await contract.candidatesCount());
      const blockchainCandidates = [];

      console.log('[useElection] Loading candidates from blockchain, count:', count);

      for (let i = 1; i <= count; i += 1) {
        try {
          const candidate = await contract.candidates(i);
          console.log('[useElection] Candidate', i, ':', {
            id: Number(candidate.id),
            name: candidate.name,
            voteCount: Number(candidate.voteCount),
            position: candidate.position !== undefined ? Number(candidate.position) : 'N/A',
            county: candidate.county || '',
            constituency: candidate.constituency || '',
            ward: candidate.ward || '',
          });
          
          blockchainCandidates.push({
            id: Number(candidate.id),
            name: candidate.name,
            voteCount: Number(candidate.voteCount),
            position: candidate.position !== undefined ? POSITION_INDEX[Number(candidate.position)] : null,
            positionIndex: candidate.position !== undefined ? Number(candidate.position) : null,
            county: candidate.county || '',
            constituency: candidate.constituency || '',
            ward: candidate.ward || '',
          });
        } catch (err) {
          console.error('[useElection] Error loading candidate', i, ':', err);
        }
      }

      const [started, ended, adminAddress] = await Promise.all([
        contract.electionStarted(),
        contract.electionEnded(),
        contract.admin(),
      ]);

      console.log('[useElection] Election state:', { started, ended, adminAddress });

      // Load Firebase candidate profiles
      const profiles = await getAllCandidateProfiles();
      console.log('[useElection] Loaded', profiles.length, 'candidate profiles from Firebase');
      setCandidateProfiles(profiles);

      // Merge blockchain candidates with Firebase profiles
      const mergedCandidates = blockchainCandidates.map(blockchainCandidate => {
        const profile = profiles.find(p => p.blockchainId === blockchainCandidate.id.toString());
        const merged = {
          ...blockchainCandidate,
          // Firebase profile fields override blockchain fields
          ...profile,
          blockchainId: blockchainCandidate.id.toString(),
          // Ensure position is set correctly
          position: blockchainCandidate.position || profile?.position || normalizePosition(profile?.position),
          positionIndex: blockchainCandidate.positionIndex ?? getPositionIndex(profile?.position),
        };
        console.log('[useElection] Merged candidate:', merged.id, merged.name, 'position:', merged.position);
        return merged;
      });

      setCandidates(mergedCandidates);
      setElectionStarted(Boolean(started));
      setElectionEnded(Boolean(ended));
      setAdmin(adminAddress);
      
      console.log('[useElection] Final candidates:', mergedCandidates.length);
    } catch (err) {
      console.error("loadElectionData error:", err);
      setError(getReadableError(err, "Failed to load election data"));
    } finally {
      setIsLoading(false);
    }
  }, [contract]);

  // Real-time listener for votes (streams live votes from USSD and Web directly into candidates tally)
  useEffect(() => {
    let unsubscribe;
    try {
      unsubscribe = onSnapshot(
        collection(db, "votes"),
        (snapshot) => {
          const voteCountsByName = {};
          const voteCountsById = {};

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const name = (data.candidateName || "").toLowerCase().trim();
            const id = String(data.candidateId || "");
            if (name) voteCountsByName[name] = (voteCountsByName[name] || 0) + 1;
            if (id) voteCountsById[id] = (voteCountsById[id] || 0) + 1;
          });

          setCandidates((prev) => {
            if (!prev || prev.length === 0) return prev;
            return prev.map((cand) => {
              const name = (cand.name || "").toLowerCase().trim();
              const id = String(cand.id || cand.blockchainId || "");
              const fsVotes = Math.max(voteCountsByName[name] || 0, voteCountsById[id] || 0);
              const currentVotes = Number(cand.voteCount || 0);
              return {
                ...cand,
                voteCount: Math.max(currentVotes, fsVotes),
              };
            });
          });
        },
        (err) => {
          console.warn("[useElection] Live votes snapshot warning:", err);
        }
      );
    } catch (e) {
      console.warn("[useElection] Live votes listener init error:", e);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const checkVoterInfo = useCallback(
    async (account) => {
      if (!contract || !account) {
        resetVoterInfo();
        return;
      }

      try {
        const result = await contract.getVoterInfo(account);
        console.log('[useElection] Voter info from contract:', result);

        if (Array.isArray(result) && result.length >= 9) {
          // New contract returns: isRegistered, hasVoted, votedFor, hasVotedPresident, hasVotedGovernor, hasVotedSenator, hasVotedWomanRep, hasVotedMP, hasVotedMCA
          const [isRegistered, hasVoted, votedFor, hasVotedPresident, hasVotedGovernor, hasVotedSenator, hasVotedWomanRep, hasVotedMP, hasVotedMCA] = result;
          
          console.log('[useElection] Parsed voter info:', {
            isRegistered,
            hasVoted,
            votedFor,
            hasVotedPresident,
            hasVotedGovernor,
            hasVotedSenator,
            hasVotedWomanRep,
            hasVotedMP,
            hasVotedMCA,
          });

          setVoterInfo({
            isRegistered: Boolean(isRegistered),
            hasVoted: Boolean(hasVoted),
            votedFor: votedFor !== undefined && votedFor !== null ? Number(votedFor) : null,
            hasVotedPresident: Boolean(hasVotedPresident),
            hasVotedGovernor: Boolean(hasVotedGovernor),
            hasVotedSenator: Boolean(hasVotedSenator),
            hasVotedWomanRep: Boolean(hasVotedWomanRep),
            hasVotedMP: Boolean(hasVotedMP),
            hasVotedMCA: Boolean(hasVotedMCA),
          });
          return;
        }

        // Fallback for old contract or if result format is different
        setVoterInfo({
          isRegistered: Boolean(result?.isRegistered),
          hasVoted: Boolean(result?.hasVoted),
          votedFor:
            result?.votedCandidateId !== undefined
              ? Number(result.votedCandidateId)
              : result?.votedFor !== undefined && result?.votedFor !== null
              ? Number(result.votedFor)
              : null,
          hasVotedPresident: null,
          hasVotedGovernor: null,
          hasVotedSenator: null,
          hasVotedWomanRep: null,
          hasVotedMP: null,
          hasVotedMCA: null,
        });
      } catch (err) {
        console.error("checkVoterInfo error:", err);
        resetVoterInfo();
      }
    },
    [contract]
  );

  const runAction = useCallback(
    async (action, loadingText, fallbackError) => {
      if (!contract) {
        throw new Error("Contract not connected");
      }

      setIsLoading(true);
      setError("");
      setActionStatus(loadingText);

      try {
        const tx = await action();
        await tx.wait();
        await loadElectionData();
        return { success: true };
      } catch (err) {
        const message = getReadableError(err, fallbackError);
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
        setActionStatus("");
      }
    },
    [contract, loadElectionData]
  );

  const addCandidate = useCallback(
    async (candidateData) => {
      console.log('[useElection] addCandidate called with:', candidateData);
      console.log('[useElection] Contract exists:', !!contract);

      // Handle both string (old format) and object (new format) for backward compatibility
      const name = typeof candidateData === 'string' 
        ? candidateData 
        : candidateData.name;

      const trimmed = String(name || "").trim();

      if (!trimmed) {
        console.error('[useElection] Candidate name is required');
        throw new Error("Candidate name is required");
      }

      try {
        // Get position index from candidate data
        const positionIndex = typeof candidateData === 'object' ? (candidateData.positionIndex ?? 0) : 0;
        const county = typeof candidateData === 'object' ? (candidateData.county || '') : '';
        const constituency = typeof candidateData === 'object' ? (candidateData.constituency || '') : '';
        const ward = typeof candidateData === 'object' ? (candidateData.ward || '') : '';

        console.log('[useElection] Adding candidate with params:', {
          name: trimmed,
          positionIndex,
          position: typeof candidateData === 'object' ? candidateData.position : undefined,
          county,
          constituency,
          ward,
        });

        // Validate position index
        if (positionIndex < 0 || positionIndex > 5) {
          throw new Error(`Invalid position index: ${positionIndex}. Must be 0-5.`);
        }

        // First, add candidate to blockchain with position and geographical data
        console.log('[useElection] Calling contract.addCandidate...');
        const result = await runAction(
          () => contract.addCandidate(trimmed, positionIndex, county, constituency, ward),
          "Adding candidate to blockchain...",
          "Failed to add candidate"
        );

        console.log('[useElection] Blockchain transaction successful:', result);

        // Get the new candidate count to determine the blockchain ID
        const newCount = Number(await contract.candidatesCount());
        const blockchainId = newCount;

        console.log('[useElection] New candidate blockchain ID:', blockchainId);

        // Then save the candidate profile to Firebase
        if (typeof candidateData === 'object' && candidateData !== null) {
          console.log('[useElection] Saving candidate profile to Firebase...');
          const firebaseDocId = await saveCandidateProfile({
            blockchainId: blockchainId,
            name: trimmed,
            party: candidateData.party || '',
            candidateCode: candidateData.candidateCode || '',
            county: county,
            constituency: constituency,
            ward: ward,
            position: candidateData.position || POSITION_INDEX[positionIndex] || '',
            location: candidateData.location || '',
            pollingCenterName: candidateData.pollingCenterName || '',
            pollingStationName: candidateData.pollingStationName || '',
            imageUrl: candidateData.imageUrl || '',
            voteCount: 0,
            isActive: true,
            createdAt: new Date().toISOString()
          });
          console.log('[useElection] Firebase profile saved with doc ID:', firebaseDocId);
        }

        // Reload data to include the new candidate
        console.log('[useElection] Reloading election data...');
        await loadElectionData();
        console.log('[useElection] Election data reloaded successfully');
        
        return result;
      } catch (err) {
        console.error('[useElection] Error in addCandidate:', err);
        console.error('[useElection] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        throw err;
      }
    },
    [contract, runAction, loadElectionData]
  );

  const startElection = useCallback(async () => {
    return runAction(
      () => contract.startElection(),
      "Starting election...",
      "Failed to start election"
    );
  }, [contract, runAction]);

  const endElection = useCallback(async () => {
    return runAction(
      () => contract.endElection(),
      "Ending election...",
      "Failed to end election"
    );
  }, [contract, runAction]);

  const vote = useCallback(
    async (candidateId) => {
      console.log('[useElection] Voting for candidate:', candidateId);
      return runAction(
        () => contract.vote(candidateId),
        "Submitting vote...",
        "Failed to vote"
      );
    },
    [contract, runAction]
  );

  /**
   * Check if voter has voted for a specific position
   * @param {string} position - Position name (president, governor, etc.)
   * @returns {boolean|null} - True if voted, false if not, null if unknown
   */
  const hasVotedForPosition = useCallback((position) => {
    const normalized = normalizePosition(position);
    const voterInfoState = voterInfo;
    
    switch (normalized) {
      case 'president':
        return voterInfoState.hasVotedPresident;
      case 'governor':
        return voterInfoState.hasVotedGovernor;
      case 'senator':
        return voterInfoState.hasVotedSenator;
      case 'woman representative':
        return voterInfoState.hasVotedWomanRep;
      case 'member of parliament':
        return voterInfoState.hasVotedMP;
      case 'mca':
        return voterInfoState.hasVotedMCA;
      default:
        return null;
    }
  }, [voterInfo]);

  /**
   * Check if voter can vote for a specific position
   * @param {string} position - Position name
   * @returns {boolean} - True if voter can vote for this position
   */
  const canVoteForPosition = useCallback((position) => {
    const hasVoted = hasVotedForPosition(position);
    return Boolean(
      voterInfo.isRegistered &&
      electionStarted &&
      !electionEnded &&
      !hasVoted &&
      !isLoading
    );
  }, [voterInfo, electionStarted, electionEnded, isLoading, hasVotedForPosition]);

  const registerVoter = useCallback(
    async (address) => {
      const normalized = String(address || "").trim().toLowerCase();

      if (!ethers.isAddress(normalized)) {
        throw new Error("Invalid wallet address");
      }

      // Check if voter is already registered on-chain
      console.log("[useElection] Checking if voter is already registered:", normalized);
      try {
        const voterInfo = await contract.getVoterInfo(normalized);
        const isRegistered = Array.isArray(voterInfo) ? voterInfo[0] : voterInfo?.isRegistered;
        
        if (isRegistered) {
          console.log("[useElection] Voter already registered on-chain, skipping registration:", normalized);
          // Return success - voter is already registered (idempotent behavior)
          return { success: true, alreadyRegistered: true };
        }
      } catch (checkError) {
        // If check fails, continue with registration attempt
        console.warn("[useElection] Could not check registration status, will attempt registration:", checkError.message);
      }

      // Voter not registered, proceed with registration
      console.log("[useElection] Registering voter on blockchain:", normalized);
      return runAction(
        () => contract.registerVoter(normalized),
        "Registering voter...",
        "Failed to register voter"
      );
    },
    [contract, runAction]
  );

  const bulkRegisterVoters = useCallback(
    async (fileOrAddresses) => {
      if (!contract) {
        throw new Error("Contract not connected");
      }

      setIsLoading(true);
      setError("");
      setActionStatus("Processing voter list...");

      try {
        let addresses = [];

        if (fileOrAddresses instanceof File) {
          const text = await readFileAsText(fileOrAddresses);
          addresses = normalizeAddressesFromText(text);
        } else if (Array.isArray(fileOrAddresses)) {
          addresses = fileOrAddresses.filter((addr) => ethers.isAddress(addr));
        } else {
          throw new Error("Please upload a CSV or TXT file");
        }

        if (!addresses.length) {
          throw new Error("No valid wallet addresses found in file");
        }

        if (typeof contract.registerVoters === "function") {
          setActionStatus(`Bulk registering ${addresses.length} voters...`);
          const tx = await contract.registerVoters(addresses);
          await tx.wait();
        } else {
          for (let i = 0; i < addresses.length; i += 1) {
            setActionStatus(
              `Registering voter ${i + 1} of ${addresses.length}...`
            );
            const tx = await contract.registerVoter(addresses[i]);
            await tx.wait();
          }
        }

        await loadElectionData();
        return {
          success: true,
          count: addresses.length,
        };
      } catch (err) {
        const message = getReadableError(err, "Failed to bulk register voters");
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
        setActionStatus("");
      }
    },
    [contract, loadElectionData]
  );

  useEffect(() => {
    if (contract) {
      loadElectionData();
    } else {
      setCandidates([]);
      setElectionStarted(null);
      setElectionEnded(null);
      setAdmin(null);
      resetVoterInfo();
      setError("");
      setActionStatus("");
      setIsLoading(false);
    }
    // Only depend on contract - loadElectionData is stable due to useCallback
  }, [contract]);

  const getWinnerResult = () => {
    if (!candidates || candidates.length === 0) return null;

    return [...candidates].sort((a, b) => {
      const votesA = Number(a.voteCount || a.votes || 0);
      const votesB = Number(b.voteCount || b.votes || 0);
      return votesB - votesA;
    })[0];
  };

  /**
   * Get winners for all positions
   * @returns {Object} - Object with position as key and winner info as value
   */
  const getWinnersByPosition = useCallback(() => {
    if (!candidates || candidates.length === 0) return {};

    const winners = {};
    const positions = ['president', 'governor', 'senator', 'woman representative', 'member of parliament', 'mca'];

    positions.forEach(position => {
      const posCandidates = candidates.filter(c => 
        normalizePosition(c.position) === position
      );

      if (posCandidates.length === 0) {
        winners[position] = null;
        return;
      }

      // Sort by vote count descending
      const sorted = [...posCandidates].sort((a, b) => {
        const votesA = Number(a.voteCount || a.votes || 0);
        const votesB = Number(b.voteCount || b.votes || 0);
        return votesB - votesA;
      });

      const totalVotes = sorted.reduce((sum, c) => sum + Number(c.voteCount || c.votes || 0), 0);
      
      // Check for tie at the top
      const topVotes = Number(sorted[0].voteCount || sorted[0].votes || 0);
      const tiedCandidates = sorted.filter(c => 
        Number(c.voteCount || c.votes || 0) === topVotes
      );

      if (tiedCandidates.length > 1 && topVotes > 0) {
        // Tie situation
        winners[position] = {
          isTie: true,
          tiedCandidates: tiedCandidates.map(c => ({
            ...c,
            percentage: totalVotes > 0 ? ((Number(c.voteCount || c.votes || 0) / totalVotes) * 100).toFixed(1) : '0.0'
          })),
          votes: topVotes,
        };
      } else {
        // Clear winner
        const winner = sorted[0];
        winners[position] = {
          isTie: false,
          winner: {
            ...winner,
            percentage: totalVotes > 0 ? ((Number(winner.voteCount || winner.votes || 0) / totalVotes) * 100).toFixed(1) : '0.0'
          },
          votes: topVotes,
        };
      }
    });

    console.log('[useElection] Winners by position:', winners);
    return winners;
  }, [candidates]);

  /**
   * Get total votes for a specific position
   * @param {string} position - Position name
   * @returns {number} - Total votes for the position
   */
  const getTotalVotesForPosition = useCallback((position) => {
    const posCandidates = candidates.filter(c => 
      normalizePosition(c.position) === position
    );
    return posCandidates.reduce((sum, c) => sum + Number(c.voteCount || c.votes || 0), 0);
  }, [candidates]);

  /**
   * Get vote percentage for a candidate within their position
   * @param {Object} candidate - Candidate object
   * @returns {string} - Percentage string
   */
  const getVotePercentageForPosition = useCallback((candidate) => {
    if (!candidate) return '0.0';
    const position = normalizePosition(candidate.position);
    const totalVotes = getTotalVotesForPosition(position);
    const votes = Number(candidate.voteCount || candidate.votes || 0);
    return totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : '0.0';
  }, [getTotalVotesForPosition]);

  return {
    candidates,
    electionStarted,
    electionEnded,
    admin,
    voterInfo,
    isLoading,
    error,
    actionStatus,
    loadElectionData,
    checkVoterInfo,
    addCandidate,
    startElection,
    endElection,
    vote,
    registerVoter,
    bulkRegisterVoters,
    getWinnerResult,
    getWinnersByPosition,
    getTotalVotesForPosition,
    getVotePercentageForPosition,
    hasVotedForPosition,
    canVoteForPosition,
  };
};

export default useElection;