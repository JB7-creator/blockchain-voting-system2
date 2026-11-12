import React, { useEffect, useMemo, useState } from "react";
import WalletConnect from "./components/WalletConnect";
import AdminPanel from "./components/AdminPanel";
import ElectionDashboard from "./components/ElectionDashboard";
import HomePage from "./components/HomePage";
import AboutPage from "./pages/AboutPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import RegistrationPage from "./pages/RegistrationPage";
import VotePage from "./pages/VotePage";
import ResultsPage from "./pages/ResultsPage";
import SautiLearnPage from "./sauti/SautiLearnPage";
import useContract from "./hooks/useContract";
import useElection from "./hooks/useElection";
import useAdmin from "./hooks/useAdmin";

function App() {
  const {
    account,
    contract,
    isConnected,
    isLoading: contractLoading,
    networkError,
    connectWallet,
    disconnectWallet,
  } = useContract();

  const {
    candidates = [],
    electionStarted,
    electionEnded,
    voterInfo,
    isLoading: electionLoading,
    error: electionError,
    actionStatus,
    checkVoterInfo,
    addCandidate,
    startElection,
    endElection,
    vote,
    registerVoter,
    bulkRegisterVoters,
    loadElectionData,
    getWinnersByPosition,
    getTotalVotesForPosition,
    getVotePercentageForPosition,
    hasVotedForPosition,
    canVoteForPosition,
  } = useElection(contract);

  const {
    isAdmin,
    adminAddress,
    isLoading: adminLoading,
  } = useAdmin(contract, account);

  // Voter location data for area-based filtering (from VotePage authentication)
  const [voterLocation, setVoterLocation] = useState(null); // { county, constituency, ward }

  // Registration status from Firestore/localStorage
  const [registrationStatus, setRegistrationStatus] = useState(null); // null, 'pending', 'approved', 'rejected'
  const [registrationData, setRegistrationData] = useState(null);

  const [showDashboard, setShowDashboard] = useState(false);
  const [currentPage, setCurrentPage] = useState('home');

  // Use voterInfo directly from useElection hook - no local state duplication
  // The hook handles all voter status updates via checkVoterInfo

  // Load registration status from localStorage (fallback)
  useEffect(() => {
    if (!account) return;
    
    const loadRegistrationStatus = () => {
      try {
        const storedRequests = JSON.parse(localStorage.getItem('voterRegistrationRequests') || '[]');
        const userRequest = storedRequests.find(req => req.walletAddress === account);
        
        if (userRequest) {
          setRegistrationStatus(userRequest.status);
          setRegistrationData(userRequest);
          console.log('[App] Registration status loaded:', userRequest.status);
        } else {
          setRegistrationStatus(null);
          setRegistrationData(null);
        }
      } catch (error) {
        console.error('[App] Error loading registration status:', error);
      }
    };

    loadRegistrationStatus();
  }, [account]);

  // Handle hash-based navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'about') {
        setCurrentPage('about');
      } else if (hash === 'how-it-works') {
        setCurrentPage('how-it-works');
      } else if (hash === 'registration') {
        setCurrentPage('registration');
      } else if (hash === 'sauti') {
        setCurrentPage('sauti');
      } else if (hash === 'admin') {
        setCurrentPage('admin');
      } else if (hash === 'vote') {
        setCurrentPage('vote');
      } else if (hash === 'results') {
        setCurrentPage('results');
      } else {
        setCurrentPage('home');
      }
    };

    // Check initial hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const hasVoted = voterInfo?.hasVoted;

  const totalVotes = useMemo(() => {
    return candidates.reduce(
      (t, c) => t + Number(c?.voteCount || 0),
      0
    );
  }, [candidates]);

  const getVotePercentage = (votes) => {
    if (totalVotes === 0) return 0;
    return Math.round((votes / totalVotes) * 100);
  };

  const refreshData = async () => {
    await loadElectionData();
    if (account && !isAdmin) {
      await checkVoterInfo(account);
    }
  };

  const errorMessage = networkError || electionError || "";

  const isLoading =
    contractLoading ||
    electionLoading ||
    adminLoading;

  // Handle wallet connection from pages
  const handleConnectWallet = async () => {
    if (!isConnected) {
      await connectWallet();
    }
    setShowDashboard(true);
  };

  // Handle navigation between pages
  const handleNavigate = (page) => {
    setCurrentPage(page);
    if (page === 'about') {
      window.location.hash = 'about';
    } else if (page === 'how-it-works') {
      window.location.hash = 'how-it-works';
    } else if (page === 'registration') {
      window.location.hash = 'registration';
    } else if (page === 'sauti') {
      window.location.hash = 'sauti';
    } else if (page === 'admin') {
      window.location.hash = 'admin';
    } else if (page === 'vote') {
      window.location.hash = 'vote';
    } else if (page === 'results') {
      window.location.hash = 'results';
    } else {
      window.location.hash = '';
    }
  };

  // Pass navigation handler to Navbar via page components
  const pageProps = {
    onConnectWallet: handleConnectWallet,
    isConnected,
    account,
    onNavigate: handleNavigate,
    electionStarted,
    electionEnded,
  };

  // Comprehensive props for VotePage
  const votePageProps = {
    ...pageProps,
    // Election data
    candidates,
    voterInfo,
    isLoading,
    error: errorMessage,
    actionStatus,
    isAdmin,
    adminAddress,
    hasVoted,
    totalVotes,
    getVotePercentage,
    // Position-based voting props
    getWinnersByPosition,
    getTotalVotesForPosition,
    getVotePercentageForPosition,
    hasVotedForPosition,
    canVoteForPosition,
    // Actions
    onVote: vote,
    onAddCandidate: addCandidate,
    onStartElection: startElection,
    onEndElection: endElection,
    onRegisterVoter: registerVoter,
    onBulkRegisterVoters: bulkRegisterVoters,
    onRefresh: refreshData,
    // Wallet
    connectWallet,
    disconnectWallet,
    networkError,
    contractLoading,
    electionLoading,
    adminLoading,
    // Voter location callback for area-based filtering
    onVoterLogin: setVoterLocation,
  };

  // Show WalletConnect component if not connected and not trying to connect
  if (!isConnected && !showDashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <WalletConnect
          account={account}
          isConnected={isConnected}
          isLoading={isLoading}
          networkError={networkError}
          connectWallet={connectWallet}
          disconnectWallet={disconnectWallet}
        />
      </div>
    );
  }

  // Show Admin panel directly for admin users
  if (isAdmin) {
    const sautiOn = process.env.REACT_APP_SAUTI_ENABLED !== 'false';

    // Admins can also use the Sauti Learn voice teacher (and go back).
    if (sautiOn && currentPage === 'sauti') {
      // Keep admins inside their tools: voting/registration pages still
      // belong to the admin panel UX for admin wallets.
      const adminNavigate = (page) => {
        if (page === 'registration' || page === 'vote' || page === 'results') {
          return handleNavigate('admin');
        }
        return handleNavigate(page);
      };
      return (
        <div className="min-h-screen">
          <div className="bg-dark-green-600 text-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">🔊 Sauti Learn — voice teacher</span>
            <button
              onClick={() => handleNavigate('admin')}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              ← Back to Admin Panel
            </button>
          </div>
          <SautiLearnPage onNavigate={adminNavigate} />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-green-50 p-6">
        <div className="bg-white p-4 mb-6 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <p><strong>Connected:</strong> {account}</p>
            <p><strong>Admin:</strong> {isAdmin ? "Yes" : "No"}</p>
          </div>
          {sautiOn && (
            <button
              onClick={() => handleNavigate('sauti')}
              className="px-4 py-2 bg-dark-green-600 hover:bg-dark-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              🔊 Open Sauti Learn
            </button>
          )}
        </div>

        <AdminPanel
          account={account}
          candidates={candidates}
          electionStarted={electionStarted}
          electionEnded={electionEnded}
          isAdmin={isAdmin}
          adminAddress={adminAddress}
          isLoading={isLoading}
          error={errorMessage}
          actionStatus={actionStatus}
          onAddCandidate={addCandidate}
          onStartElection={startElection}
          onEndElection={endElection}
          onRegisterVoter={registerVoter}
          onBulkRegisterVoters={bulkRegisterVoters}
          onRefresh={refreshData}
        />
      </div>
    );
  }

  // Show Dashboard overlay when connected user wants to vote
  if (isConnected && showDashboard) {
    // Results page props
    const resultsPageProps = {
      candidates,
      electionStarted,
      electionEnded,
      isLoading,
      onRefresh: refreshData,
      isConnected,
      contract,
      onLoadElectionData: loadElectionData,
      registrationStatus,
      voterInfo,
      voter: voterLocation,
      getWinnersByPosition,
    };

    const renderCurrentPage = () => {
      switch (currentPage) {
        case 'about':
          return <AboutPage {...pageProps} />;
        case 'how-it-works':
          return <HowItWorksPage {...pageProps} />;
        case 'registration':
          return <RegistrationPage {...pageProps} />;
        case 'sauti':
          return <SautiLearnPage {...pageProps} />;
        case 'vote':
          return <VotePage {...votePageProps} />;
        case 'results':
          return <ResultsPage {...resultsPageProps} />;
        default:
          return <HomePage {...pageProps} />;
      }
    };

    return (
      <div className="min-h-screen">
        {renderCurrentPage()}
        
        {/* Dashboard Overlay */}
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">Connected:</p>
                <p className="font-mono text-sm font-semibold text-dark-green-700">{account}</p>
                <p className="text-sm text-gray-500 mt-1">
                  <strong>Admin:</strong> {isAdmin ? "Yes" : "No"}
                </p>
              </div>
              <button
                onClick={() => setShowDashboard(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                Close Dashboard
              </button>
            </div>
            
            <div className="p-6">
              <ElectionDashboard
                electionStarted={electionStarted}
                electionEnded={electionEnded}
                candidates={candidates}
                hasVoted={hasVoted}
                voterInfo={voterInfo}
                voter={voterLocation}
                isLoading={isLoading}
                error={errorMessage}
                onVote={vote}
                totalVotes={totalVotes}
                getVotePercentage={getVotePercentage}
                getWinnersByPosition={getWinnersByPosition}
                hasVotedForPosition={hasVotedForPosition}
                canVoteForPosition={canVoteForPosition}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show pages for connected but not in dashboard mode
  if (isConnected && !showDashboard) {
    // Results page props
    const resultsPageProps = {
      candidates,
      electionStarted,
      electionEnded,
      isLoading,
      onRefresh: refreshData,
      isConnected,
      contract,
      onLoadElectionData: loadElectionData,
      registrationStatus,
      voterInfo,
      voter: voterLocation,
      getWinnersByPosition,
    };

    switch (currentPage) {
      case 'about':
        return <AboutPage {...pageProps} />;
      case 'how-it-works':
        return <HowItWorksPage {...pageProps} />;
      case 'registration':
        return <RegistrationPage {...pageProps} />;
      case 'sauti':
        return <SautiLearnPage {...pageProps} />;
      case 'vote':
        return <VotePage {...votePageProps} />;
      case 'results':
        return <ResultsPage {...resultsPageProps} />;
      default:
        return <HomePage {...pageProps} />;
    }
  }

  // Default fallback
  return <HomePage {...pageProps} />;
}

export default App;