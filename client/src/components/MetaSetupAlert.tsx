import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MetaSetupAlertProps {
  isAuthenticated: boolean;
  onLogin: () => void;
}

export default function MetaSetupAlert({ isAuthenticated, onLogin }: MetaSetupAlertProps) {
  if (isAuthenticated) return null;
  
  return (
    <Alert className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex justify-between items-center">
        <span>Connect to Meta to access your campaigns and create video ads</span>
        <Button onClick={onLogin} size="sm" variant="outline">
          Connect to Meta
        </Button>
      </AlertDescription>
    </Alert>
  );
}