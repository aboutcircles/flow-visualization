import React from 'react';
import { cn } from '@/lib/utils';

export const Tabs = ({ children, className, ...props }) => {
  return (
    <div className={cn("w-full", className)} {...props}>
      {children}
    </div>
  );
};

export const TabsList = ({ children, className, ...props }) => {
  return (
    <div 
      className={cn(
        "flex space-x-1 rounded-xl bg-gray-100 p-1 mb-4",
        className
      )} 
      {...props}
    >
      {children}
    </div>
  );
};

export const TabsTrigger = ({ 
  children, 
  className, 
  isActive = false,
  onClick,
  ...props 
}) => {
  return (
    <button
      className={cn(
        "px-4 py-2 text-sm font-medium rounded-lg transition-all",
        isActive 
          ? "bg-white text-blue-600 shadow-sm" 
          : "text-gray-600 hover:bg-gray-200 hover:text-gray-900",
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({ 
  children, 
  className,
  isActive = false,
  ...props 
}) => {
  if (!isActive) return null;
  
  return (
    <div 
      className={cn(
        "mt-2 rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};