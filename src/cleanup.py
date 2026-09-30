import re

with open('d:/5dmaty/kids-service-app/src/pages/Dashboard.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_secret = False
for i, line in enumerate(lines):
    if 'function SecretView' in line:
        skip_secret = True
    if not skip_secret:
        new_lines.append(line)

content = ''.join(new_lines)
content = re.sub(r'<Link to="/smart-gallery".*?</Link>', '', content, flags=re.DOTALL)
content = re.sub(r'<button onClick=\{.*?setCurrentView\(\'secret\'\).*?</button>', '', content, flags=re.DOTALL)
content = re.sub(r'\{currentView === \'secret\' && <SecretView.*?/>\}', '', content, flags=re.DOTALL)
content = re.sub(r'const \[isScanningFace.*?\] = useState\(false\);', '', content)
content = re.sub(r'faceDescriptor: null, careType: "NORMAL"', 'careType: "NORMAL"', content)
content = re.sub(r'faceDescriptor: child\.faceDescriptor \|\| null,', '', content)

content = re.sub(r'if \(window\.confirm\("تحب الذكاء الاصطناعي.*?setIsScanningFace\(false\);\n\s*\}', '', content, flags=re.DOTALL)
content = re.sub(r'disabled=\{isScanningFace\}', '', content)
content = re.sub(r'\{isScanningFace \? \(.*?\) : \(.*?\{formChild\.faceDescriptor \?.*?\) : \(\n.*?<User.*?/>\n.*?\)\n.*?\}', '<User size={32} className="text-slate-300" />', content, flags=re.DOTALL)

with open('d:/5dmaty/kids-service-app/src/pages/Dashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Dashboard Cleaned')
