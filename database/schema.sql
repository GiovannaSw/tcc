-- =====================================================
-- Saúde em Dia - estrutura LIMPA do banco (sem dados de teste)
-- Importe este arquivo no banco criado pelo seu provedor.
-- (Não tem CREATE DATABASE: use o banco que o provedor já criou.)
-- =====================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `senha` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `pacientes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `idade` INT DEFAULT NULL,
  `peso` DECIMAL(5,2) DEFAULT NULL,
  `altura` DECIMAL(3,2) DEFAULT NULL,
  `sangue` VARCHAR(3) DEFAULT NULL,
  `usuario_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pacientes_usuario` (`usuario_id`),
  CONSTRAINT `fk_pacientes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `remedios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `dose` VARCHAR(50) DEFAULT NULL,
  `hora` TIME DEFAULT NULL,
  `frequencia` VARCHAR(50) DEFAULT NULL,
  `usuario_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_remedios_usuario` (`usuario_id`),
  CONSTRAINT `fk_remedios_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sintomas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(100) NOT NULL,
  `nivel` VARCHAR(50) DEFAULT NULL,
  `observacao` TEXT DEFAULT NULL,
  `data_registro` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sintomas_usuario` (`usuario_id`),
  CONSTRAINT `fk_sintomas_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `consultas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `especialidade` VARCHAR(100) NOT NULL,
  `medico` VARCHAR(100) DEFAULT NULL,
  `data_consulta` DATE DEFAULT NULL,
  `hora_consulta` TIME DEFAULT NULL,
  `local_consulta` VARCHAR(150) DEFAULT NULL,
  `usuario_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_consultas_usuario` (`usuario_id`),
  CONSTRAINT `fk_consultas_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
