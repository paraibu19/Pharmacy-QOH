import re

with open('src/components/Layout.tsx', 'r') as f:
    content = f.read()

# 1. Remove isSynced state
content = re.sub(r'  const \[isSynced, setIsSynced\] = useState\(false\);\n', '', content)

# 2. Remove onSnapshotsInSync useEffect
old_use_effect = """  useEffect(() => {
    if (!db) return;

    // Monitor when Firestore completes a sync operation
    const unsubscribe = onSnapshotsInSync(db, () => {
      setIsSynced(true);
      // Flash the synced state briefly
      const timer = setTimeout(() => setIsSynced(false), 3000);
      return () => clearTimeout(timer);
    });

    return () => unsubscribe();
  }, []);"""
content = content.replace(old_use_effect, "")

# 3. Change NavLinks to renderNavLinks
content = content.replace("const NavLinks = ({ variant }: { variant: 'horizontal' | 'vertical-mobile' | 'vertical-sidebar' }) => {", "const renderNavLinks = (variant: 'horizontal' | 'vertical-mobile' | 'vertical-sidebar') => {")

content = content.replace('<NavLinks variant="vertical-sidebar" />', "{renderNavLinks('vertical-sidebar')}")
content = content.replace('<NavLinks variant="vertical-mobile" />', "{renderNavLinks('vertical-mobile')}")

with open('src/components/Layout.tsx', 'w') as f:
    f.write(content)
