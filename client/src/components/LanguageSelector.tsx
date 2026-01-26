import { useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { languages, Language } from "@/data/languages";

interface LanguageSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function LanguageSelector({ value, onValueChange, className }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const selectedLanguage = languages.find((lang) => lang.code === value);

  // Filter languages based on search
  const filteredLanguages = languages.filter(
    (lang) =>
      lang.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      lang.nativeName.toLowerCase().includes(searchValue.toLowerCase()) ||
      lang.code.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            data-testid="button-language-selector"
          >
            {selectedLanguage ? (
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {selectedLanguage.name} ({selectedLanguage.nativeName})
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Select a language...
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Type to search languages..." 
              value={searchValue}
              onValueChange={setSearchValue}
              data-testid="input-language-search"
            />
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {filteredLanguages.map((language) => (
                <CommandItem
                  key={language.code}
                  value={language.code}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                    setSearchValue("");
                  }}
                  data-testid={`option-language-${language.code}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === language.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{language.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {language.nativeName} • {language.code}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}