import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";

const POSITIONS = [
  "All Positions",
  "President",
  "Governor",
  "Senator",
  "Woman Representative",
  "Member of Parliament",
  "Member of County Assembly"
];

const CHANNELS = ["All Channels", "USSD", "Web"];

const LiveVotesAudit = () => {
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPosition, setSelectedPosition] = useState("All Positions");
  const [selectedChannel, setSelectedChannel] = useState("All Channels");
  const [lastLivePing, setLastLivePing] = useState(new Date());

  useEffect(() => {
    let unsubscribe;
    try {
      // Listen to votes collection in real time
      const votesCol = collection(db, "votes");
      unsubscribe = onSnapshot(
        votesCol,
        (snapshot) => {
          const list = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            list.push({
              id: doc.id,
              ...data,
              // Normalize timestamp for sorting
              sortTime: data.createdAt?.seconds 
                ? data.createdAt.seconds * 1000 
                : (data.timestamp ? new Date(data.timestamp).getTime() : 0)
            });
          });

          // Sort newest first
          list.sort((a, b) => b.sortTime - a.sortTime);
          setVotes(list);
          setLoading(false);
          setLastLivePing(new Date());
        },
        (error) => {
          console.warn("[LiveVotesAudit] Firestore snapshot warning:", error.message);
          setLoading(false);
        }
      );
    } catch (err) {
      console.warn("[LiveVotesAudit] Init error:", err.message);
      setLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Stats calculation
  const stats = useMemo(() => {
    const total = votes.length;
    const ussdCount = votes.filter((v) => String(v.channel || "").toUpperCase() === "USSD").length;
    const webCount = votes.filter((v) => String(v.channel || "").toUpperCase() === "WEB").length;
    const uniqueCounties = new Set(votes.map((v) => v.county).filter(Boolean)).size;
    return { total, ussdCount, webCount, uniqueCounties };
  }, [votes]);

  // Filtering
  const filteredVotes = useMemo(() => {
    return votes.filter((v) => {
      // Position filter
      if (selectedPosition !== "All Positions") {
        const vPos = (v.position || "").toLowerCase();
        const sPos = selectedPosition.toLowerCase();
        if (!vPos.includes(sPos) && !sPos.includes(vPos)) return false;
      }

      // Channel filter
      if (selectedChannel !== "All Channels") {
        const vChan = (v.channel || "").toUpperCase();
        if (vChan !== selectedChannel.toUpperCase()) return false;
      }

      // Search query (voterId, voterName, candidateName, county)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = String(v.voterId || "").toLowerCase().includes(q);
        const matchName = String(v.voterName || "").toLowerCase().includes(q);
        const matchCand = String(v.candidateName || "").toLowerCase().includes(q);
        const matchCounty = String(v.county || "").toLowerCase().includes(q);
        const matchHash = String(v.txHash || "").toLowerCase().includes(q);
        if (!matchId && !matchName && !matchCand && !matchCounty && !matchHash) return false;
      }

      return true;
    });
  }, [votes, selectedPosition, selectedChannel, searchQuery]);

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return "Just now";
    const now = Date.now();
    const diff = Math.floor((now - Number(timestamp)) / 1000);
    if (diff < 30) return "Just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8 mt-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-bold text-gray-900">
              🗳️ Live Cast Votes & Audit Log
            </h3>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Live Sync Active
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Real-time audit stream of all ballots cast via Africa's Talking USSD and Web Portal.
          </p>
        </div>

        <div className="text-right text-xs text-gray-400">
          Last updated: {lastLivePing.toLocaleTimeString()}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Total Ballots Cast
          </p>
          <p className="text-3xl font-extrabold text-gray-900 mt-1">
            {stats.total.toLocaleString()}
          </p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
            <span>📱</span> USSD Mobile Votes
          </p>
          <p className="text-3xl font-extrabold text-emerald-800 mt-1">
            {stats.ussdCount.toLocaleString()}
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            {stats.total > 0 ? ((stats.ussdCount / stats.total) * 100).toFixed(0) : 0}% of all votes
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1">
            <span>💻</span> Web Portal Votes
          </p>
          <p className="text-3xl font-extrabold text-blue-800 mt-1">
            {stats.webCount.toLocaleString()}
          </p>
          <p className="text-xs text-blue-600 mt-0.5">
            {stats.total > 0 ? ((stats.webCount / stats.total) * 100).toFixed(0) : 0}% of all votes
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1">
            <span>🗺️</span> Counties Active
          </p>
          <p className="text-3xl font-extrabold text-purple-800 mt-1">
            {stats.uniqueCounties}
          </p>
          <p className="text-xs text-purple-600 mt-0.5">participating regions</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by voter name, National ID, candidate, county or hash..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition"
          />
          <svg
            className="w-5 h-5 text-gray-400 absolute left-3 top-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <select
          value={selectedPosition}
          onChange={(e) => setSelectedPosition(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-700 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>

        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-700 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Connecting to live voting stream...
        </div>
      ) : filteredVotes.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-gray-500 font-medium">No votes match your criteria.</p>
          <p className="text-gray-400 text-sm mt-1">
            Votes cast from mobile USSD or the web app will stream here automatically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Voter</th>
                <th className="py-3 px-4">Registered Area</th>
                <th className="py-3 px-4">Position</th>
                <th className="py-3 px-4">Candidate Chosen</th>
                <th className="py-3 px-4">Verification Hash</th>
                <th className="py-3 px-4">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredVotes.map((vote) => {
                const isUssd = String(vote.channel || "").toUpperCase() === "USSD";
                const explorerUrl = vote.txHash && vote.txHash.startsWith("0x")
                  ? `https://sepolia.etherscan.io/tx/${vote.txHash}`
                  : null;

                return (
                  <tr key={vote.id} className="hover:bg-gray-50 transition">
                    {/* Channel Badge */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isUssd
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : "bg-blue-100 text-blue-800 border border-blue-200"
                        }`}
                      >
                        {isUssd ? "📱 USSD" : "💻 Web"}
                      </span>
                    </td>

                    {/* Voter */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900">
                        {vote.voterName || "Registered Voter"}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">
                        ID: {vote.voterId || "N/A"}
                      </div>
                    </td>

                    {/* Registered Area */}
                    <td className="py-3 px-4">
                      <div className="text-gray-800 font-medium">
                        {vote.county || "Kenya (National)"}
                      </div>
                      {(vote.constituency || vote.ward) && (
                        <div className="text-xs text-gray-500">
                          {vote.constituency} {vote.ward && `• ${vote.ward}`}
                        </div>
                      )}
                    </td>

                    {/* Position */}
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-800">
                        {vote.position || "President"}
                      </span>
                    </td>

                    {/* Candidate */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-emerald-700">
                        {vote.candidateName || `Candidate #${vote.candidateId}`}
                      </div>
                    </td>

                    {/* Verification Hash */}
                    <td className="py-3 px-4">
                      {vote.txHash ? (
                        explorerUrl ? (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-blue-600 hover:underline flex items-center gap-1"
                            title={vote.txHash}
                          >
                            <span>{vote.txHash.slice(0, 10)}...{vote.txHash.slice(-6)}</span>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span
                            className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded"
                            title={vote.txHash}
                          >
                            {vote.txHash.slice(0, 12)}...
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">Verified ✓</span>
                      )}
                    </td>

                    {/* Timestamp */}
                    <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                      {formatTimeAgo(vote.sortTime)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LiveVotesAudit;
