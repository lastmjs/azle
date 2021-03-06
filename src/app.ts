import * as fs from 'fs';
import { execSync } from 'child_process';
import { compileJSToRust } from './compile';

app();

type DfxJson = Readonly<{
    canisters: Readonly<{
        [key: string]: JSCanisterConfig;
    }>;
}>;

type JSCanisterConfig = Readonly<{
    type: 'custom';
    build: string;
    root: string;
    ts: string;
    candid: string;
    wasm: string;
}>;

function app() {
    const canisterName = process.argv[2];
    const dfxJson: DfxJson = JSON.parse(fs.readFileSync('dfx.json').toString());
    const canisterConfig = dfxJson.canisters[canisterName];

    const rootPath = canisterConfig.root;
    const tsPath = canisterConfig.ts;
    const candidPath = canisterConfig.candid;

    createRustCode(
        canisterName,
        rootPath,
        tsPath,
        candidPath
    );

    compileRustCode(canisterName);
}

function createRustCode(
    canisterName: string,
    rootPath: string,
    tsPath: string,
    candidPath: string
) {
    createCargoTomls(
        canisterName,
        rootPath
    );

    createLibRs(
        rootPath,
        tsPath
    );
}

function createCargoTomls(
    canisterName: string,
    rootPath: string
) {
    fs.writeFileSync('./Cargo.toml', `
        # This code is automatically generated by Azle

        [workspace]
        members = [
            "${rootPath}"
        ]

        [profile.release]
        lto = true
        opt-level = 'z'
    `);

    fs.writeFileSync(`${rootPath}/Cargo.toml`, `
        # This code is automatically generated by Azle

        [package]
        name = "${canisterName}"
        version = "0.0.0"
        edition = "2018"

        [lib]
        crate-type = ["cdylib"]

        [dependencies]
        ic-cdk = "0.3.2"
        ic-cdk-macros = "0.3.2"
        Boa = { git = "https://github.com/lastmjs/boa-azle" }
        getrandom = { version = "0.2.3", features = ["custom"] }
        serde = "1.0.130"
        serde_json = "1.0.68"
    `);
}

function createLibRs(
    rootPath: string,
    tsPath: string
) {
    if (!fs.existsSync(`${rootPath}/src`)) {
        fs.mkdirSync(`${rootPath}/src`);
    }

    // TODO probably  get rid of this read file sync
    const js = fs.readFileSync(tsPath).toString();

    const rust = compileJSToRust(
        tsPath,
        js
    );

    fs.writeFileSync(`${rootPath}/src/lib.rs`, rust);
}

function compileRustCode(canisterName: string) {
    execSync(
        `cargo build --target wasm32-unknown-unknown --package ${canisterName} --release`,
        { stdio: 'inherit' }
    );

    // optimization, binary is too big to deploy without this
    execSync(
        `cargo install ic-cdk-optimizer --root target`,
        { stdio: 'inherit' }
    );
    execSync(
        `./target/bin/ic-cdk-optimizer ./target/wasm32-unknown-unknown/release/${canisterName}.wasm -o ./target/wasm32-unknown-unknown/release/${canisterName}.wasm`,
        { stdio: 'inherit' }
    );
}