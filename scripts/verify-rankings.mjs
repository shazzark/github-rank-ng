import { readFile } from 'node:fs/promises';

const rankingFiles = ['dist/users.json', 'dist/users.nigeria.json'];

for (const file of rankingFiles) {
  let users;
  try {
    users = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot deploy: ${file} is missing or invalid JSON.`, { cause: error });
  }

  if (!Array.isArray(users) || users.length === 0) {
    throw new Error(`Cannot deploy: ${file} must contain at least one verified profile.`);
  }

  const ids = new Set();
  const logins = new Set();
  for (const [index, user] of users.entries()) {
    if (!user || user.type !== 'User' || !Number.isSafeInteger(user.id)
      || typeof user.login !== 'string' || user.login.trim().length === 0
      || !Number.isInteger(user.followers) || user.followers < 0
      || user.rank !== index + 1) {
      throw new Error(`Cannot deploy: ${file} has an invalid profile or rank at position ${index + 1}.`);
    }

    const login = user.login.trim().toLowerCase();
    if (ids.has(user.id) || logins.has(login)) {
      throw new Error(`Cannot deploy: ${file} contains duplicate GitHub users.`);
    }
    ids.add(user.id);
    logins.add(login);

    if (index > 0 && users[index - 1].followers < user.followers) {
      throw new Error(`Cannot deploy: ${file} is not ranked by descending follower count.`);
    }
  }

  console.log(`Verified ${users.length} profiles in ${file}.`);
}
