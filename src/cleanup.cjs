const fs = require('fs');
const path = 'd:/5dmaty/kids-service-app/src/pages/Dashboard.jsx';

let content = fs.readFileSync(path, 'utf8');

// Remove SmartGallery Link
content = content.replace(/<Link to="\/smart-gallery".*?<\/Link>/gs, '');

// Remove SecretView Button
content = content.replace(/<button onClick=\{.*?setCurrentView\('secret'\).*?<\/button>/gs, '');

// Remove SecretView Component Rendering
content = content.replace(/\{currentView === 'secret' && <SecretView.*?\/>\}/g, '');

// Remove isScanningFace State
content = content.replace(/const \[isScanningFace.*?\] = useState\(false\);/g, '');

// Clean careType
content = content.replace(/faceDescriptor: null, careType: "NORMAL"/g, 'careType: "NORMAL"');
content = content.replace(/faceDescriptor: child\.faceDescriptor \|\| null,/g, '');

// Remove face scan block
content = content.replace(/if \(window\.confirm\("تحب الذكاء الاصطناعي.*?\n\s*setIsScanningFace\(false\);\n\s*\}/gs, '');

// Clean disabled
content = content.replace(/disabled=\{isScanningFace\}/g, '');

// Remove face scanner UI and replace with default icon
content = content.replace(/\{isScanningFace \? \(.*?\) : \(.*?\{formChild\.faceDescriptor \?.*?\) : \(\n.*?<User.*?\/>\n.*?\)\n.*?\}/gs, '<User size={32} className="text-slate-300" />');

// Now, remove the SecretView component definition entirely
let lines = content.split('\n');
let newLines = [];
let skip = false;
for (let line of lines) {
    if (line.includes('function SecretView')) {
        skip = true;
    }
    if (!skip) {
        newLines.push(line);
    }
}
content = newLines.join('\n');

fs.writeFileSync(path, content, 'utf8');
console.log('Dashboard Cleaned with Node');
