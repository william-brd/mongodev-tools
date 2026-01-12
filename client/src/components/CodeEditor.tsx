import React, { useState } from "react";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-mongodb";
import { cn } from "@/lib/utils";

// Add some basic styling for Prism
import "prismjs/themes/prism-tomorrow.css"; // Dark theme

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  language?: string;
  readOnly?: boolean;
  className?: string;
}

export function CodeEditor({ 
  code, 
  onChange, 
  language = "javascript", 
  readOnly = false,
  className
}: CodeEditorProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div 
      className={cn(
        "relative rounded-lg overflow-hidden border transition-all duration-200 bg-[#1e1e1e]",
        focused ? "border-primary/50 ring-2 ring-primary/10 shadow-lg shadow-primary/5" : "border-border",
        readOnly ? "opacity-80 cursor-default" : "cursor-text",
        className
      )}
    >
      <div className="absolute top-0 right-0 px-3 py-1 bg-black/20 text-[10px] text-muted-foreground font-mono uppercase tracking-wider rounded-bl-lg pointer-events-none z-10">
        {language}
      </div>
      
      <div 
        className="min-h-[200px] h-full font-mono text-sm leading-relaxed"
        onFocus={() => !readOnly && setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <Editor
          value={code}
          onValueChange={onChange}
          highlight={(code) => highlight(code, languages.javascript, "javascript")} // using JS highlighter for Mongo shell syntax
          padding={20}
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 14,
            minHeight: "100%",
            backgroundColor: "transparent",
          }}
          textareaClassName="focus:outline-none"
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
