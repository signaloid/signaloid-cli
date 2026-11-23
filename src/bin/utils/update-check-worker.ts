import { refreshUpdateCache } from "./update-check";

const packageName = process.argv[2];
if (packageName) {
	void refreshUpdateCache({ packageName });
}
