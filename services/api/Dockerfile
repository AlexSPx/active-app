FROM rust:1.90.0 AS development
WORKDIR /workspace
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY services/api services/api
COPY apps/client/lib/data/exercise-catalog.json apps/client/lib/data/exercise-catalog.json
CMD ["cargo", "run", "--locked", "-p", "active-api"]
