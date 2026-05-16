import React from "react";

const Footer: React.FC = () => (
  <footer className="bg-[#1a1a1a] text-gray-400 text-xs">
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <img
          src="/hd-logo-white.png"
          alt="Hunter Douglas"
          className="h-6 opacity-80"
        />
        <span className="text-gray-500">&copy; {new Date().getFullYear()} Hunter Douglas</span>
      </div>
      <nav className="flex items-center gap-5" aria-label="Footer links">
        <a
          href="https://hdbrite.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors"
        >
          Privacy Policy
        </a>
        <a
          href="https://www.hunterdouglas.com/terms-of-use"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors"
        >
          Terms of Use
        </a>
        <a
          href="mailto:britesupport@hunterdouglas.com"
          className="hover:text-white transition-colors"
        >
          Support
        </a>
      </nav>
    </div>
  </footer>
);

export default Footer;
