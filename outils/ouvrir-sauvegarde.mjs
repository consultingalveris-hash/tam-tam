// Ouvre une copie de sauvegarde Tam-Tam (.ttbk) avec la clé privée gardée sur l'ordinateur de l'Éditeur.
// Usage : node ouvrir-sauvegarde.mjs tamtam-2026-11-13.ttbk cle-privee.pem tamtam.db
//         node ouvrir-sauvegarde.mjs medias-xxx.ttbk cle-privee.pem dossier-medias/   (paquet de photos et vidéos)
import fs from 'node:fs'; import crypto from 'node:crypto'; import zlib from 'node:zlib';
const [src, keyFile, out] = process.argv.slice(2);
if (!src || !keyFile || !out) { console.error('Usage : node ouvrir-sauvegarde.mjs <copie.ttbk> <cle-privee.pem> <sortie.db>'); process.exit(1); }
const b = fs.readFileSync(src);
if (b.subarray(0, 6).toString() !== 'TTBK1\n') throw new Error('Ce fichier n’est pas une copie Tam-Tam.');
const n = b.readUInt32BE(6), wrapped = b.subarray(10, 10 + n), tag = b.subarray(10 + n, 26 + n), body = b.subarray(26 + n);
const kiv = crypto.privateDecrypt({ key: fs.readFileSync(keyFile), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
const d = crypto.createDecipheriv('aes-256-gcm', kiv.subarray(0, 32), kiv.subarray(32, 44)); d.setAuthTag(tag);
const plain = Buffer.concat([d.update(body), d.final()]);
if (plain[0] === 0x1f && plain[1] === 0x8b) { fs.writeFileSync(out, zlib.gunzipSync(plain)); console.log('Base de données restaurée dans', out); }
else {
  // Paquet de médias : index JSON puis fichiers (déjà chiffrés de bout en bout), à remettre dans /data/media.
  const n = plain.readUInt32BE(0), index = JSON.parse(plain.subarray(4, 4 + n).toString()); let off = 4 + n;
  fs.mkdirSync(out, { recursive: true });
  for (const f of index) { if (!/^[A-Za-z0-9_-]{10,40}$/.test(f.id)) throw new Error('Nom de fichier invalide'); fs.writeFileSync(out + '/' + f.id, plain.subarray(off, off + f.size)); off += f.size; }
  console.log(index.length, 'fichiers restaurés dans', out);
}
