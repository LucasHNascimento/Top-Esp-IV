-- Tabela utilizada pela aplicacao que executa na maquina virtual aplicacao.
--
-- Caminho recomendado no roteiro, digitando as instrucoes no cliente interativo:
--
--     docker exec -it postgres_container psql -U root -d projeto
--
-- Caminho alternativo, aplicando este arquivo de uma vez:
--
--     docker exec -i postgres_container psql -U root -d projeto < criar-tabela.sql

CREATE TABLE IF NOT EXISTS pessoas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    telefone VARCHAR(20)
);
