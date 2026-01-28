import { Button } from "@/components/ui/button";
import { Zap, FileText, BarChart3 } from "lucide-react";
import { Link, useLocation } from "wouter";
import w3wLogo from "@/assets/w3w-logo.png";

interface HeaderProps {
  isAuthenticated: boolean;
  onLogout: () => void;
  onLogin: () => void;
}

export default function Header({ isAuthenticated, onLogout, onLogin }: HeaderProps) {
  const [location] = useLocation();
  
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-8">
            <div className="flex items-center">
              <img src={w3wLogo} alt="what3words" className="h-12 w-12" />
              <h1 className="ml-2 text-xl font-semibold text-neutral-900">
                Meta Creative Asset Generator
              </h1>
            </div>
            
            {/* Navigation Tabs */}
            <nav className="flex space-x-1">
              <Link href="/">
                <Button 
                  variant="default"
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <Zap className="h-4 w-4" />
                  <span>Video Creator</span>
                </Button>
              </Link>
            </nav>
          </div>
          <div>
            {isAuthenticated ? (
              <div className="flex items-center">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <span className="h-2 w-2 mr-1 rounded-full bg-green-400"></span>
                  Connected to Meta
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-4 text-primary hover:bg-primary hover:text-white"
                  onClick={onLogout}
                >
                  Logout
                </Button>
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                className="text-primary hover:bg-primary hover:text-white"
                onClick={onLogin}
              >
                Connect to Meta
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
