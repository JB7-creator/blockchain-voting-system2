import React, { useState, useEffect } from 'react';

const Navbar = ({ onConnectWallet, isConnected, account, onNavigate }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeLink, setActiveLink] = useState('Home');

  const navLinks = ['Home', 'About', 'How It Works', 'Registration', 'Vote', 'Results'];
  // Sauti Learn is opt-out via env (shown by default). See src/sauti/.
  if (process.env.REACT_APP_SAUTI_ENABLED !== 'false') navLinks.splice(3, 0, 'Sauti Learn');

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleNavClick = (link) => {
    setActiveLink(link);
    setIsMobileMenuOpen(false);
    
    if (link === 'About') {
      // Navigate to About page
      if (onNavigate) {
        onNavigate('about');
      } else {
        window.location.hash = 'about';
      }
    } else if (link === 'How It Works') {
      // Navigate to How It Works page
      if (onNavigate) {
        onNavigate('how-it-works');
      } else {
        window.location.hash = 'how-it-works';
      }
    } else if (link === 'Home') {
      // Navigate to Home page
      if (onNavigate) {
        onNavigate('home');
      } else {
        window.location.hash = '';
      }
    } else if (link === 'Registration') {
      // Navigate to Registration page
      if (onNavigate) {
        onNavigate('registration');
      } else {
        window.location.hash = 'registration';
      }
    } else if (link === 'Sauti Learn') {
      // Navigate to Sauti Learn (voice teacher) page
      if (onNavigate) {
        onNavigate('sauti');
      } else {
        window.location.hash = 'sauti';
      }
    } else if (link === 'Vote') {
      // Navigate to Vote page
      if (onNavigate) {
        onNavigate('vote');
      } else {
        window.location.hash = 'vote';
      }
    } else if (link === 'Results') {
      // Navigate to Results page
      if (onNavigate) {
        onNavigate('results');
      } else {
        window.location.hash = 'results';
      }
    } else {
      // For other links, scroll to section on Home page
      if (onNavigate) {
        onNavigate('home');
      }
      // Scroll to section after navigation
      setTimeout(() => {
        const sectionId = link.toLowerCase().replace(/\s+/g, '-');
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  // Update active link based on current hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'about') {
        setActiveLink('About');
      } else if (hash === 'how-it-works') {
        setActiveLink('How It Works');
      } else if (hash === 'registration') {
        setActiveLink('Registration');
      } else if (hash === 'sauti') {
        setActiveLink('Sauti Learn');
      } else if (hash === 'vote') {
        setActiveLink('Vote');
      } else if (hash === 'results') {
        setActiveLink('Results');
      } else {
        // Check scroll position for other sections
        const sections = ['how-it-works', 'vote', 'results'];
        for (const section of sections) {
          const element = document.getElementById(section);
          if (element) {
            const rect = element.getBoundingClientRect();
            if (rect.top <= 100 && rect.bottom >= 100) {
              const sectionName = section.charAt(0).toUpperCase() + section.slice(1).replace('-', ' ');
              setActiveLink(sectionName);
              return;
            }
          }
        }
        setActiveLink('Home');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div 
            className="flex items-center cursor-pointer"
            onClick={() => handleNavClick('Home')}
          >
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold text-dark-green-800">DeVote</h1>
              <p className="text-xs text-dark-green-600 -mt-1">Kenya Elections</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <button
                key={link}
                onClick={() => handleNavClick(link)}
                className={`text-sm font-medium transition-colors duration-200 ${
                  activeLink === link
                    ? 'text-dark-green-700 border-b-2 border-dark-green-500 pb-1'
                    : 'text-gray-600 hover:text-dark-green-600'
                }`}
              >
                {link}
              </button>
            ))}
          </div>

          {/* Connect Wallet Button */}
          <div className="hidden md:flex items-center">
            <button
              onClick={onConnectWallet}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                isConnected
                  ? 'bg-dark-green-100 text-dark-green-700 hover:bg-dark-green-200'
                  : 'bg-dark-green-600 text-white hover:bg-dark-green-700 shadow-md hover:shadow-lg'
              }`}
            >
              {isConnected && account
                ? `${account.slice(0, 6)}...${account.slice(-4)}`
                : 'Sign In to Vote'}
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={toggleMobileMenu}
              className="text-gray-600 hover:text-dark-green-600 focus:outline-none"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isMobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
          <div className="px-4 pt-2 pb-4 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link}
                onClick={() => handleNavClick(link)}
                className={`block w-full text-left px-3 py-2 rounded-md text-base font-medium ${
                  activeLink === link
                    ? 'bg-dark-green-50 text-dark-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-dark-green-600'
                }`}
              >
                {link}
              </button>
            ))}
            <div className="pt-4 mt-2 border-t border-gray-100">
              <button
                onClick={onConnectWallet}
                className={`w-full px-3 py-2 rounded-md font-medium text-sm transition-all duration-200 ${
                  isConnected
                    ? 'bg-dark-green-100 text-dark-green-700'
                    : 'bg-dark-green-600 text-white hover:bg-dark-green-700'
                }`}
              >
                {isConnected && account
                  ? `${account.slice(0, 6)}...${account.slice(-4)}`
                  : 'Sign In to Vote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;