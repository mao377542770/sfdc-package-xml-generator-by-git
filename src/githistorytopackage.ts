import { exec } from "child_process";
import path from "path";
import * as vscode from "vscode";

// SFDC　フォルダ名とメタデータ名の対応関係
const folderToMetadataTypeMap = new Map([
    ["classes", "ApexClass"],
    ["triggers", "ApexTrigger"],
    ["pages", "ApexPage"],
    ["components", "ApexComponent"],
    ["aura", "AuraDefinitionBundle"],
    ["lwc", "LightningComponentBundle"],
    ["listViews", "ListView"],
    ["fields", "CustomField"], // 項目名のチェックは最初にする
    ["objects", "CustomObject"],
    ["permissionsets", "PermissionSet"],
    ["profiles", "Profile"],
    ["workflows", "Workflow"],
    ["staticresources", "StaticResource"],
    ["email", "EmailTemplate"],
    ["tabs", "CustomTab"],
    ["layouts", "Layout"],
    ["reports", "Report"],
    ["dashboards", "Dashboard"],
    ["flows", "Flow"],
    ["translations", "Translations"],
    ["remoteSiteSettings", "RemoteSiteSetting"],
    ["labels", "CustomLabels"],
    ["sharingRules", "SharingRules"],
    ["applications", "CustomApplication"],
    ["cachePartitions", "PlatformCachePartition"],
    ["connectedApps", "ConnectedApp"],
    ["contentassets", "ContentAsset"],
    ["customMetadata", "CustomMetadata"],
    ["globalValueSets", "GlobalValueSet"],
    // 今後追加...
]);

export class GitHistoryToPackageXMLController {
    public async run() {
        const commit1 = await vscode.window.showInputBox({
            placeHolder: "Enter the first commit ID",
        });
        const commit2 = await vscode.window.showInputBox({
            placeHolder: "Enter the second commit ID",
        });

        if (!commit1) {
            vscode.window.showErrorMessage("First commit ID is required");
            return;
        }

        const files = await GitHistoryToPackageXMLController.getChangedFiles(
            commit1,
            commit2
        ).catch((err) => {
            vscode.window.showErrorMessage(`Error: ${err.message}`);
        });
        if (!files) {
            return;
        }
        const classifiedFiles = this.classifyFiles(files);
        const xmlContent = this.generateXML(classifiedFiles);
        const document = await vscode.workspace.openTextDocument({
            content: xmlContent,
            language: "xml",
        });
        await vscode.window.showTextDocument(document);
    }

    /**
     * 2つのCommitの履歴に差分するファイルを取得する
     * 削除したファイルが含まない
     * @author wu.chunshu
     *
     * @public
     * @static
     * @param {string} commit1
     * @param {string} commit2
     * @returns {Promise<string[]>}
     */
    public static getChangedFiles(
        commit1: string,
        commit2?: string
    ): Promise<string[]> {
        return new Promise((resolve, reject) => {
            let gitCommand: string;
            if (commit2) {
                gitCommand = `git diff --name-only --diff-filter=AMR ${commit1} ${commit2}`;
            } else {
                gitCommand = `git diff --name-only --diff-filter=AMR ${commit1}^ ${commit1}`;
            }

            exec(
                gitCommand,
                { cwd: vscode.workspace.rootPath },
                (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    if (stderr) {
                        reject(new Error(stderr));
                        return;
                    }
                    const files = stdout.split("\n").filter((file) => file);
                    resolve(files);
                }
            );
        });
    }

    /**
     * ファイル履歴により、フォルダ名とファイル名のリストを作成する
     * @param files
     * @returns
     */
    public classifyFiles(files: string[]): Record<string, string[]> {
        const classified: Record<string, string[]> = {};
        files.forEach((file) => {
            const dir = path.dirname(file);

            let metadataType;
            for (const folderName of folderToMetadataTypeMap.keys()) {
                if (dir.includes(folderName)) {
                    metadataType = folderToMetadataTypeMap.get(folderName);
                    break;
                }
            }
            if (!metadataType) {
                metadataType = dir;
            }

            // 親メタデータの
            let parentMeta = "";
            if (["CustomField", "ListView"].includes(metadataType)) {
                const match = file.match(/(?<=objects\/).*?(?=\/)/);
                parentMeta = match ? match[0] + "." : "";
            }

            if (metadataType === "Layout") {
                file = decodeEscapedString(file);
            }

            let dotIndex = file.indexOf(".");
            // ファイル名 ⇒ メタデータ名に変更
            if (["CustomMetadata"].includes(metadataType)) {
                dotIndex = file.indexOf(".", dotIndex + 1); // 第二.から
            }

            const fileName =
                parentMeta + path.basename(file, file.substring(dotIndex)); // 拡張子とファイルパスをクリアする

            if (!classified[metadataType]) {
                classified[metadataType] = [];
            }
            classified[metadataType].push(fileName);
        });
        return classified;
    }

    /**
     * フォルダ名とファイル名でパッケージを作成する
     * @param files
     * @returns
     */
    public generateXML(classifiedFiles: Record<string, string[]>): string {
        let xml =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';
        for (const [folder, files] of Object.entries(classifiedFiles)) {
            xml += "  <types>\n";
            files.forEach((file) => {
                xml += `    <members>${file}</members>\n`;
            });
            xml += `    <name>${folder}</name>\n`;
            xml += "  </types>\n";
        }
        xml += "  <version>60.0</version>\n</Package>";
        return xml;
    }
}

/**
 * レイアウト名を変換する
 * @param escapedString 
 * @returns 
 */

function decodeEscapedString(escapedString: string) {
    // 将 \ 替换为 %，以便使用 decodeURIComponent 解码
    const percentEncodedString = escapedString.replace(
        /\\([0-7]{3})/g,
        function (match, octal) {
            return (
                "%" +
                parseInt(octal, 8).toString(16).padStart(2, "0").toUpperCase()
            );
        }
    );
    // 使用 decodeURIComponent 解码
    return decodeURIComponent(percentEncodedString);
}
