import React from 'react';
import * as LucideIcons from 'lucide-react';

interface IconProps {
  name: string;
  className?: string;
  size?: number | string;
}

export default function Icon({ name, className, size }: IconProps) {
  // Convert kebab-case to PascalCase (e.g., user-plus -> UserPlus)
  const pascalName = name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  
  // Resolve standard or custom mappings
  let LucideIconComponent = (LucideIcons as any)[pascalName];
  
  // Fallbacks if formatting is different
  if (!LucideIconComponent) {
    const normalizedName = name.charAt(0).toUpperCase() + name.slice(1);
    LucideIconComponent = (LucideIcons as any)[normalizedName];
  }

  // Final fallback icon is HelpCircle or CircleHelp or Help
  if (!LucideIconComponent) {
    LucideIconComponent = (LucideIcons as any).HelpCircle || (LucideIcons as any).CircleHelp || (LucideIcons as any).Help || 'span';
  }

  return <LucideIconComponent className={className} size={size} />;
}
